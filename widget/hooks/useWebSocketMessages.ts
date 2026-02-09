import { useState, useEffect, useCallback, useRef } from "react";
import {
  createWebSocketClient,
  getWebSocketClient,
  type ServerMessage,
  type ConnectionStatus,
  type AssistantPart,
  type AssistantPartsMessage,
  type AnyConversationEntry,
  type ImageAttachment,
} from "../services/websocket";
import { requestPushToken, setupTapHandler } from "../services/notifications";

interface UseWebSocketMessagesOptions {
  serverUrl: string;
  onGitMessage: (message: ServerMessage) => void;
}

export function useWebSocketMessages({ serverUrl, onGitMessage }: UseWebSocketMessagesOptions) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [messages, setMessages] = useState<ServerMessage[]>([]);
  const [currentParts, setCurrentParts] = useState<AssistantPart[]>([]);

  const currentPartsRef = useRef<AssistantPart[]>([]);
  const currentPromptIdRef = useRef<string | null>(null);
  const partIdCounter = useRef(0);
  const pushTokenSentRef = useRef(false);
  const onGitMessageRef = useRef(onGitMessage);

  // Keep ref in sync to avoid stale closures
  useEffect(() => {
    onGitMessageRef.current = onGitMessage;
  }, [onGitMessage]);

  // Helper to finalize current parts into a message
  const finalizeCurrentParts = useCallback((promptId: string, isComplete: boolean) => {
    const parts = currentPartsRef.current;
    if (parts.length > 0) {
      const partsMsg: AssistantPartsMessage = {
        type: "assistant_parts",
        promptId,
        parts,
        isComplete,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, partsMsg]);
    }
    currentPartsRef.current = [];
    currentPromptIdRef.current = null;
    setCurrentParts([]);
  }, []);

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case "stream":
        // Handle new prompt starting
        if (message.promptId !== currentPromptIdRef.current) {
          // New response - finalize any previous parts first
          if (currentPartsRef.current.length > 0 && currentPromptIdRef.current) {
            finalizeCurrentParts(currentPromptIdRef.current, false);
          }
          currentPromptIdRef.current = message.promptId;
        }
        // Add text chunk to current parts
        if (!message.done && message.chunk) {
          const parts = currentPartsRef.current;
          const lastPart = parts[parts.length - 1];
          if (lastPart?.type === "text") {
            // Append to existing text part
            lastPart.content += message.chunk;
            currentPartsRef.current = [...parts];
          } else {
            // Create new text part
            currentPartsRef.current = [...parts, {
              type: "text",
              id: `text-${partIdCounter.current++}`,
              content: message.chunk
            }];
          }
          setCurrentParts([...currentPartsRef.current]);
        }
        break;
      case "tool":
        // Only add completed/failed tools to parts (skip "started")
        if (message.status !== "started") {
          const toolPart: AssistantPart = {
            type: "tool",
            id: `tool-${partIdCounter.current++}`,
            toolName: message.toolName,
            status: message.status,
            input: message.input,
            output: message.output,
            timestamp: message.timestamp,
          };
          currentPartsRef.current = [...currentPartsRef.current, toolPart];
          setCurrentParts([...currentPartsRef.current]);
        }
        break;
      case "result": {
        // Finalize parts into a message
        if (currentPartsRef.current.length > 0) {
          const partsMsg: AssistantPartsMessage = {
            type: "assistant_parts",
            promptId: message.promptId,
            parts: currentPartsRef.current,
            isComplete: true,
            timestamp: message.timestamp,
          };
          // Add result message for metadata (cost, duration) only — strip result.result
          // to avoid duplicating the content that's already in partsMsg with proper formatting
          const hasMetadata = message.costUsd !== undefined || message.durationMs !== undefined || (!message.success && message.error);
          if (hasMetadata) {
            const metadataOnly = { ...message, result: undefined };
            setMessages((prev) => [...prev, partsMsg, metadataOnly]);
          } else {
            setMessages((prev) => [...prev, partsMsg]);
          }
        } else if (message.costUsd !== undefined || message.durationMs !== undefined || (!message.success && message.error)) {
          setMessages((prev) => [...prev, message]);
        }
        currentPartsRef.current = [];
        currentPromptIdRef.current = null;
        setCurrentParts([]);
        break;
      }
      case "error":
        // Finalize any partial parts and add error
        if (currentPartsRef.current.length > 0 && currentPromptIdRef.current) {
          const partsMsg: AssistantPartsMessage = {
            type: "assistant_parts",
            promptId: currentPromptIdRef.current,
            parts: currentPartsRef.current,
            isComplete: false,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, partsMsg, message]);
        } else {
          setMessages((prev) => [...prev, message]);
        }
        currentPartsRef.current = [];
        currentPromptIdRef.current = null;
        setCurrentParts([]);
        break;
      case "status":
        // Clear pending flag on user prompt once server acknowledges
        if (message.status === "processing") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.type === "user_prompt" && last.pending) {
              return [...prev.slice(0, -1), { ...last, pending: false }];
            }
            return prev;
          });
        }
        break;
      case "session_cleared":
        // Clear all messages for new session
        setMessages([]);
        currentPartsRef.current = [];
        currentPromptIdRef.current = null;
        partIdCounter.current = 0;
        setCurrentParts([]);
        break;
      case "stopped":
        // Preserve partial work when stopped
        if (currentPartsRef.current.length > 0 && currentPromptIdRef.current) {
          finalizeCurrentParts(currentPromptIdRef.current, false);
        } else {
          currentPartsRef.current = [];
          currentPromptIdRef.current = null;
          setCurrentParts([]);
        }
        break;
      case "history": {
        // Convert history entries to displayable messages
        const historyMessages: ServerMessage[] = message.entries.flatMap((entry: AnyConversationEntry): ServerMessage[] => {
          if (entry.role === "user") {
            const images: ImageAttachment[] | undefined =
              entry.imagePaths && entry.imagePaths.length > 0
                ? entry.imagePaths.map((uri) => ({ uri }))
                : undefined;
            return [{
              type: "user_prompt" as const,
              content: entry.content,
              images,
              timestamp: entry.timestamp,
            }];
          } else if (entry.role === "assistant") {
            return [{
              type: "history_result" as const,
              content: entry.content,
              timestamp: entry.timestamp,
            }];
          } else if (entry.role === "tool") {
            // Reconstruct tool message from persisted entry
            return [{
              type: "tool" as const,
              promptId: "",
              toolName: entry.toolName,
              status: entry.status,
              input: entry.input,
              output: entry.output,
              timestamp: entry.timestamp,
            }];
          } else if (entry.role === "system") {
            // Reconstruct system message (errors, stopped, etc.) from persisted entry
            return [{
              type: "system_message" as const,
              messageType: entry.type,
              content: entry.content,
              timestamp: entry.timestamp,
            }];
          }
          return [];
        });
        setMessages(historyMessages);
        break;
      }
      // Delegate git messages to the git state hook
      case "git_status":
      case "branches_list":
      case "branch_switched":
      case "branch_created":
        onGitMessageRef.current(message);
        break;
    }
  }, [finalizeCurrentParts]);

  // Initialize WebSocket connection immediately (even when collapsed)
  // so it's already connected when user expands the widget
  useEffect(() => {
    console.log("[expo-air] Connecting to:", serverUrl?.replace(/([?&])secret=[^&]+/, "$1secret=***"));
    const client = createWebSocketClient({
      url: serverUrl,
      onStatusChange: setStatus,
      onMessage: handleMessage,
      onError: (error) => {
        console.warn("[expo-air] WebSocket error:", error);
      },
    });
    client.connect();

    return () => {
      client.disconnect();
    };
  }, [serverUrl]);

  // Setup notification tap handler (dev-only, expands widget on tap)
  useEffect(() => {
    const cleanup = setupTapHandler((promptId, success) => {
      // When user taps notification, ensure WebSocket is connected
      const client = getWebSocketClient();
      if (client && !client.isConnected()) {
        client.connect();
      }
      // The native side handles expanding the widget when app opens from notification
    });
    return cleanup;
  }, []);

  const handleSubmit = useCallback(async (prompt: string, images?: ImageAttachment[]) => {
    // Add user prompt to messages immediately for optimistic display
    setMessages((prev) => [
      ...prev,
      {
        type: "user_prompt" as const,
        content: prompt,
        images,
        pending: true,
        timestamp: Date.now(),
      },
    ]);
    // Reset current response state
    currentPartsRef.current = [];
    currentPromptIdRef.current = null;
    setCurrentParts([]);

    // Send prompt immediately with local file paths
    // The server runs on the same machine and can read simulator temp files directly
    const imagePaths = images && images.length > 0
      ? images.map((img) => img.uri)
      : undefined;

    const client = getWebSocketClient();
    if (client) {
      client.sendPrompt(prompt, imagePaths);
    }

    // Request push token lazily on first submit (don't block UI)
    if (!pushTokenSentRef.current) {
      const token = await requestPushToken();
      if (token) {
        const wsClient = getWebSocketClient();
        if (wsClient?.isConnected()) {
          wsClient.sendPushToken(token);
          pushTokenSentRef.current = true;
        }
      }
    }
  }, []);

  const handleNewSession = useCallback(() => {
    const client = getWebSocketClient();
    if (client) {
      client.requestNewSession();
    }
  }, []);

  const handleStop = useCallback(() => {
    const client = getWebSocketClient();
    if (client) {
      client.requestStop();
    }
  }, []);

  return {
    status,
    messages,
    currentParts,
    handleSubmit,
    handleNewSession,
    handleStop,
  };
}
