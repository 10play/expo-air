import React, { useRef, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import type { ServerMessage, ToolMessage, ResultMessage } from "../services/websocket";

interface ResponseAreaProps {
  messages: ServerMessage[];
  currentResponse: string;
}

export function ResponseArea({ messages, currentResponse }: ResponseAreaProps) {
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    // Auto-scroll to bottom when content changes
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages, currentResponse]);

  const hasContent = messages.length > 0 || currentResponse.length > 0;

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
    <ScrollView
      ref={scrollViewRef}
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={true}
    >
      {messages.map((msg, index) => (
        <MessageItem key={index} message={msg} />
      ))}
      {currentResponse.length > 0 && (
        <View style={styles.messageContainer}>
          <Text style={styles.responseText}>{currentResponse}</Text>
          <View style={styles.cursor} />
        </View>
      )}
    </ScrollView>
  );
}

function MessageItem({ message }: { message: ServerMessage }) {
  switch (message.type) {
    case "stream":
      return null; // Handled by currentResponse

    case "tool":
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

    default:
      return null;
  }
}

function ToolItem({ tool }: { tool: ToolMessage }) {
  const statusIcon = {
    started: "⟳",
    completed: "✓",
    failed: "✕",
  }[tool.status];

  const statusColor = {
    started: "#FF9500",
    completed: "#30D158",
    failed: "#FF453A",
  }[tool.status];

  // Format input for display
  const inputDisplay = tool.input
    ? typeof tool.input === "string"
      ? tool.input
      : JSON.stringify(tool.input).substring(0, 100)
    : null;

  return (
    <View style={styles.toolContainer}>
      <View style={styles.toolHeader}>
        <Text style={[styles.toolStatus, { color: statusColor }]}>
          {statusIcon}
        </Text>
        <Text style={styles.toolName}>{tool.toolName}</Text>
      </View>
      {inputDisplay && (
        <Text style={styles.toolInput} numberOfLines={2}>
          {inputDisplay}
        </Text>
      )}
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
  toolContainer: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 12,
    marginVertical: 6,
  },
  toolHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  toolStatus: {
    fontSize: 15,
    marginRight: 8,
  },
  toolName: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    fontWeight: "500",
  },
  toolInput: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    marginTop: 6,
    fontFamily: "monospace",
  },
});
