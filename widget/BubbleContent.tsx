import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, NativeModules, TouchableOpacity } from "react-native";
import { PromptInput } from "./components/PromptInput";
import { ResponseArea } from "./components/ResponseArea";
import {
  createWebSocketClient,
  getWebSocketClient,
  type ServerMessage,
  type ConnectionStatus,
} from "./services/websocket";

const { ExpoFlow } = NativeModules;

function handleCollapse() {
  try {
    ExpoFlow?.collapse?.();
  } catch (e) {
    console.warn("[expo-flow] Failed to collapse:", e);
  }
}

interface BubbleContentProps {
  size?: number;
  color?: string;
  expanded?: boolean;
  serverUrl?: string;
}

export function BubbleContent({
  size = 60,
  color = "#007AFF",
  expanded = false,
  serverUrl = "ws://localhost:3847",
}: BubbleContentProps) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [messages, setMessages] = useState<ServerMessage[]>([]);
  const [currentResponse, setCurrentResponse] = useState("");

  // Initialize WebSocket connection when expanded
  useEffect(() => {
    if (!expanded) {
      return;
    }

    console.log("[expo-flow] Connecting to:", serverUrl);
    const client = createWebSocketClient({
      url: serverUrl,
      onStatusChange: setStatus,
      onMessage: handleMessage,
      onError: (error) => {
        console.error("[expo-flow] WebSocket error:", error);
      },
    });
    client.connect();

    return () => {
      client.disconnect();
    };
  }, [expanded, serverUrl]);

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case "stream":
        if (!message.done) {
          setCurrentResponse((prev) => prev + message.chunk);
        }
        break;
      case "result":
        // Finalize the response
        setMessages((prev) => [...prev, message]);
        setCurrentResponse("");
        break;
      case "error":
        setMessages((prev) => [...prev, message]);
        setCurrentResponse("");
        break;
      case "tool":
        setMessages((prev) => [...prev, message]);
        break;
      case "status":
        // Status is handled by the status indicator
        break;
    }
  }, []);

  const handleSubmit = useCallback((prompt: string) => {
    // Clear previous messages for new prompt
    setMessages([]);
    setCurrentResponse("");

    const client = getWebSocketClient();
    if (client) {
      client.sendPrompt(prompt);
    }
  }, []);

  if (!expanded) {
    return (
      <View
        style={[
          styles.collapsed,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
          },
        ]}
      >
        <StatusDot status={status} />
        <Text style={styles.collapsedText}>F</Text>
      </View>
    );
  }

  return (
    <View style={[styles.expanded, { backgroundColor: color }]}>
      <Header status={status} />
      <View style={styles.body}>
        <ResponseArea messages={messages} currentResponse={currentResponse} />
      </View>
      <PromptInput
        onSubmit={handleSubmit}
        disabled={status === "disconnected"}
        isProcessing={status === "processing"}
      />
    </View>
  );
}

function Header({ status }: { status: ConnectionStatus }) {
  const statusConfig = {
    disconnected: { text: "Disconnected", color: "#FF3B30" },
    connecting: { text: "Connecting...", color: "#FFB800" },
    connected: { text: "Connected", color: "#34C759" },
    processing: { text: "Claude is working...", color: "#FFB800" },
  };

  const { text, color } = statusConfig[status];

  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={handleCollapse} style={styles.closeButton}>
        <Text style={styles.closeButtonText}>✕</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Expo Flow</Text>
      <View style={styles.statusContainer}>
        <View style={[styles.statusIndicator, { backgroundColor: color }]} />
        <Text style={styles.statusText}>{text}</Text>
      </View>
    </View>
  );
}

function StatusDot({ status }: { status: ConnectionStatus }) {
  const colors = {
    disconnected: "#FF3B30",
    connecting: "#FFB800",
    connected: "#34C759",
    processing: "#FFB800",
  };

  return (
    <View
      style={[
        styles.statusDot,
        { backgroundColor: colors[status] },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  collapsed: {
    alignItems: "center",
    justifyContent: "center",
  },
  collapsedText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
  },
  statusDot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.8)",
  },
  expanded: {
    width: 300,
    height: 400,
    borderRadius: 16,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  closeButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  title: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
  },
  body: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
});
