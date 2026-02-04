import React, { useRef, useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, NativeScrollEvent, NativeSyntheticEvent, Keyboard, Platform } from "react-native";
import type { ServerMessage, ToolMessage, ResultMessage, UserPromptMessage, HistoryResultMessage, AssistantPart, AssistantPartsMessage } from "../services/websocket";

interface ResponseAreaProps {
  messages: ServerMessage[];
  currentParts: AssistantPart[];
}

export function ResponseArea({ messages, currentParts }: ResponseAreaProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const contentHeightRef = useRef(0);
  const scrollViewHeightRef = useRef(0);

  // Track if user is at bottom (within 50px threshold)
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    setIsAtBottom(distanceFromBottom < 50);
  }, []);

  // Track content size changes
  const handleContentSizeChange = useCallback((width: number, height: number) => {
    contentHeightRef.current = height;
  }, []);

  // Track scroll view layout
  const handleLayout = useCallback((event: { nativeEvent: { layout: { height: number } } }) => {
    scrollViewHeightRef.current = event.nativeEvent.layout.height;
  }, []);

  // Auto-scroll only when at bottom
  useEffect(() => {
    if (isAtBottom) {
      // Small delay to ensure content is rendered
      const timeout = setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: false });
      }, 16);
      return () => clearTimeout(timeout);
    }
  }, [messages, currentParts, isAtBottom]);

  // Scroll to bottom when user sends a new message
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.type === "user_prompt") {
      scrollViewRef.current?.scrollToEnd({ animated: true });
      setIsAtBottom(true);
    }
  }, [messages]);

  // Scroll to bottom when keyboard opens (if already at bottom)
  useEffect(() => {
    const keyboardEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const subscription = Keyboard.addListener(keyboardEvent, () => {
      if (isAtBottom) {
        // Delay to let the native resize happen first
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    });
    return () => subscription.remove();
  }, [isAtBottom]);

  const scrollToBottom = useCallback(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
    setIsAtBottom(true);
  }, []);

  const hasContent = messages.length > 0 || currentParts.length > 0;

  if (!hasContent) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>
          Send a prompt to start coding with Claude
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={true}
        onScroll={handleScroll}
        onContentSizeChange={handleContentSizeChange}
        onLayout={handleLayout}
        scrollEventThrottle={16}
      >
        {messages.map((msg, index) => (
          <MessageItem key={index} message={msg} />
        ))}
        {currentParts.length > 0 && (
          <PartsRenderer parts={currentParts} isStreaming={true} />
        )}
      </ScrollView>
      {!isAtBottom && (
        <TouchableOpacity style={styles.scrollButton} onPress={scrollToBottom} activeOpacity={0.8}>
          <Text style={styles.scrollButtonText}>↓</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function MessageItem({ message }: { message: ServerMessage }) {
  switch (message.type) {
    case "stream":
      return null; // Handled by currentParts

    case "tool":
      // Legacy: individual tool messages from history
      return <ToolItem tool={message} />;

    case "result":
      return <ResultItem result={message} />;

    case "error":
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{message.message}</Text>
        </View>
      );

    case "status":
      return null; // Handled by header

    case "user_prompt":
      return <UserPromptItem message={message} />;

    case "history_result":
      return <HistoryResultItem message={message} />;

    case "assistant_parts":
      return <AssistantPartsItem message={message} />;

    default:
      return null;
  }
}

function UserPromptItem({ message }: { message: UserPromptMessage }) {
  return (
    <View style={styles.userPromptContainer}>
      <Text style={styles.userPromptText}>{message.content}</Text>
    </View>
  );
}

function HistoryResultItem({ message }: { message: HistoryResultMessage }) {
  return (
    <View style={styles.resultContainer}>
      <Text style={styles.responseText}>{message.content}</Text>
    </View>
  );
}

// Renders interleaved text and tool parts in order
function PartsRenderer({ parts, isStreaming }: { parts: AssistantPart[], isStreaming: boolean }) {
  return (
    <View style={styles.partsContainer}>
      {parts.map((part, index) => {
        if (part.type === "text") {
          const isLastPart = index === parts.length - 1;
          return (
            <View key={part.id} style={styles.messageContainer}>
              <Text style={styles.responseText}>{part.content}</Text>
              {isStreaming && isLastPart && <View style={styles.cursor} />}
            </View>
          );
        } else if (part.type === "tool") {
          return <ToolPartItem key={part.id} part={part} />;
        }
        return null;
      })}
    </View>
  );
}

// Renders a completed assistant response with parts
function AssistantPartsItem({ message }: { message: AssistantPartsMessage }) {
  return (
    <View style={styles.resultContainer}>
      <PartsRenderer parts={message.parts} isStreaming={false} />
      {!message.isComplete && (
        <Text style={styles.interruptedText}>(interrupted)</Text>
      )}
    </View>
  );
}

// Tool part renderer (different from ToolItem which handles ToolMessage)
function ToolPartItem({ part }: { part: AssistantPart & { type: "tool" } }) {
  if (part.status === "started") return null;

  const isFailed = part.status === "failed";
  const input = part.input as Record<string, unknown> | undefined;

  const getFileName = (path: string): string => path.split('/').pop() || path;

  const getToolLabel = (): string => {
    switch (part.toolName) {
      case "Read": return "read";
      case "Edit": return "edit";
      case "Write": return "write";
      case "Bash": return "$";
      case "Glob": return "glob";
      case "Grep": return "grep";
      case "Task": return "agent";
      default: return part.toolName.toLowerCase();
    }
  };

  const getValue = (): string => {
    switch (part.toolName) {
      case "Read":
      case "Edit":
      case "Write":
        return getFileName(input?.file_path as string || "file");
      case "Bash": {
        const cmd = input?.command as string || "";
        return cmd.length > 45 ? cmd.slice(0, 45) + "…" : cmd;
      }
      case "Glob":
        return input?.pattern as string || "*";
      case "Grep":
        return input?.pattern as string || "search";
      case "Task":
        return input?.description as string || "task";
      default:
        return "";
    }
  };

  return (
    <View style={styles.toolLine}>
      <Text style={isFailed ? styles.toolLabelFailed : styles.toolLabel}>{getToolLabel()}</Text>
      <Text style={isFailed ? styles.toolValueFailed : styles.toolValue} numberOfLines={1}>{getValue()}</Text>
      {isFailed && <Text style={styles.toolLabelFailed}> ✕</Text>}
    </View>
  );
}

function ToolItem({ tool }: { tool: ToolMessage }) {
  if (tool.status === "started") return null;

  const isFailed = tool.status === "failed";
  const input = tool.input as Record<string, unknown> | undefined;

  const getFileName = (path: string): string => path.split('/').pop() || path;

  const getToolLabel = (): string => {
    switch (tool.toolName) {
      case "Read": return "read";
      case "Edit": return "edit";
      case "Write": return "write";
      case "Bash": return "$";
      case "Glob": return "glob";
      case "Grep": return "grep";
      case "Task": return "agent";
      default: return tool.toolName.toLowerCase();
    }
  };

  const getValue = (): string => {
    switch (tool.toolName) {
      case "Read":
      case "Edit":
      case "Write":
        return getFileName(input?.file_path as string || "file");
      case "Bash": {
        const cmd = input?.command as string || "";
        return cmd.length > 45 ? cmd.slice(0, 45) + "…" : cmd;
      }
      case "Glob":
        return input?.pattern as string || "*";
      case "Grep":
        return input?.pattern as string || "search";
      case "Task":
        return input?.description as string || "task";
      default:
        return "";
    }
  };

  return (
    <View style={styles.toolLine}>
      <Text style={isFailed ? styles.toolLabelFailed : styles.toolLabel}>{getToolLabel()}</Text>
      <Text style={isFailed ? styles.toolValueFailed : styles.toolValue} numberOfLines={1}>{getValue()}</Text>
      {isFailed && <Text style={styles.toolLabelFailed}> ✕</Text>}
    </View>
  );
}

function ResultItem({ result }: { result: ResultMessage }) {
  if (!result.success && result.error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{result.error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.resultContainer}>
      {result.result && (
        <Text style={styles.responseText}>{result.result}</Text>
      )}
      {(result.costUsd !== undefined || result.durationMs !== undefined) && (
        <Text style={styles.metaText}>
          {result.durationMs !== undefined && `${result.durationMs}ms`}
          {result.costUsd !== undefined && result.durationMs !== undefined && " • "}
          {result.costUsd !== undefined && `$${result.costUsd.toFixed(4)}`}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    position: "relative",
  },
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  messageContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  responseText: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 15,
    lineHeight: 22,
  },
  cursor: {
    width: 2,
    height: 18,
    backgroundColor: "#fff",
    marginLeft: 2,
    opacity: 0.7,
  },
  resultContainer: {
    marginTop: 8,
  },
  partsContainer: {
    // Container for interleaved parts
  },
  interruptedText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 4,
  },
  metaText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    marginTop: 10,
  },
  errorContainer: {
    backgroundColor: "rgba(255,59,48,0.15)",
    borderRadius: 12,
    padding: 12,
    marginVertical: 6,
  },
  errorText: {
    color: "#FF6B6B",
    fontSize: 14,
  },
  toolLine: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 4,
  },
  toolLabel: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginRight: 8,
    minWidth: 36,
  },
  toolLabelFailed: {
    color: "rgba(255,100,100,0.6)",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginRight: 8,
    minWidth: 36,
  },
  toolValue: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    flexShrink: 1,
  },
  toolValueFailed: {
    color: "rgba(255,100,100,0.7)",
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    flexShrink: 1,
  },
  userPromptContainer: {
    backgroundColor: "rgba(0,122,255,0.15)",
    borderRadius: 16,
    padding: 12,
    marginVertical: 8,
    alignSelf: "flex-end",
    maxWidth: "85%",
  },
  userPromptText: {
    color: "#fff",
    fontSize: 15,
    lineHeight: 20,
  },
  scrollButton: {
    position: "absolute",
    bottom: 16,
    alignSelf: "center",
    left: "50%",
    marginLeft: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
});
