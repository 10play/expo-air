import React, { useState } from "react";
import { View, Text, StyleSheet, Platform, Image, ActivityIndicator } from "react-native";
import type {
  ServerMessage,
  ToolMessage,
  ResultMessage,
  UserPromptMessage,
  HistoryResultMessage,
  SystemDisplayMessage,
  AssistantPart,
  AssistantPartsMessage,
} from "../services/websocket";
import { FormattedText } from "./FormattedText";
import { SPACING, LAYOUT, COLORS, TYPOGRAPHY } from "../constants/design";

export function MessageItem({ message }: { key?: React.Key; message: ServerMessage }) {
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

    case "system_message":
      return <SystemMessageItem message={message} />;

    default:
      return null;
  }
}

function ChatImageThumb({ uri }: { uri: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  return (
    <View style={styles.userImageThumb}>
      {loading && !error && (
        <ActivityIndicator
          size="small"
          color="rgba(255,255,255,0.4)"
          style={StyleSheet.absoluteFill}
        />
      )}
      {!error ? (
        <Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, { borderRadius: SPACING.SM }]}
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setError(true); }}
        />
      ) : null}
    </View>
  );
}

function UserPromptItem({ message }: { message: UserPromptMessage }) {
  return (
    <View style={[styles.userPromptContainer, message.pending && styles.userPromptPending]}>
      {message.images && message.images.length > 0 && (
        <View style={styles.userImages}>
          {message.images.map((img, i) => (
            <ChatImageThumb key={i} uri={img.uri} />
          ))}
        </View>
      )}
      {message.content ? (
        <Text style={styles.userPromptText} selectable>{message.content}</Text>
      ) : null}
    </View>
  );
}

function HistoryResultItem({ message }: { message: HistoryResultMessage }) {
  return (
    <View style={styles.resultContainer}>
      <FormattedText content={message.content} />
    </View>
  );
}

function SystemMessageItem({ message }: { message: SystemDisplayMessage }) {
  // Use error styling for errors, muted styling for other system messages
  if (message.messageType === "error") {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{message.content}</Text>
      </View>
    );
  }
  // Stopped and info messages use muted styling
  return (
    <View style={styles.systemContainer}>
      <Text style={styles.systemText}>{message.content}</Text>
    </View>
  );
}

// Renders interleaved text and tool parts in order
export function PartsRenderer({ parts, isStreaming }: { parts: AssistantPart[], isStreaming: boolean }) {
  return (
    <View style={styles.partsContainer}>
      {parts.map((part, index) => {
        if (part.type === "text") {
          const isLastPart = index === parts.length - 1;
          return (
            <View key={part.id} style={styles.messageContainer}>
              <FormattedText content={part.content} isStreaming={isStreaming && isLastPart} />
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

// Shared helper for tool display info
function getToolDisplayInfo(toolName: string, input: Record<string, unknown> | undefined): { label: string; value: string } {
  const getFileName = (path: string): string => path.split('/').pop() || path;

  switch (toolName) {
    case "Read":
      return { label: "read", value: getFileName(input?.file_path as string || "file") };
    case "Edit":
      return { label: "edit", value: getFileName(input?.file_path as string || "file") };
    case "Write":
      return { label: "write", value: getFileName(input?.file_path as string || "file") };
    case "Bash": {
      const cmd = input?.command as string || "";
      return { label: "$", value: cmd.length > 45 ? cmd.slice(0, 45) + "…" : cmd };
    }
    case "Glob":
      return { label: "glob", value: input?.pattern as string || "*" };
    case "Grep":
      return { label: "grep", value: input?.pattern as string || "search" };
    case "Task":
      return { label: "agent", value: input?.description as string || "task" };
    default:
      return { label: toolName.toLowerCase(), value: "" };
  }
}

// Renders a tool display line (shared between ToolPartItem and ToolItem)
function ToolDisplay({ toolName, input, isFailed }: { toolName: string; input?: unknown; isFailed: boolean }) {
  const { label, value } = getToolDisplayInfo(toolName, input as Record<string, unknown> | undefined);

  return (
    <View style={styles.toolLine}>
      <Text style={isFailed ? styles.toolLabelFailed : styles.toolLabel}>{label}</Text>
      <Text style={isFailed ? styles.toolValueFailed : styles.toolValue} numberOfLines={1}>{value}</Text>
      {isFailed && <Text style={styles.toolLabelFailed}> ✕</Text>}
    </View>
  );
}

// Tool part renderer (for parts in AssistantPartsMessage)
function ToolPartItem({ part }: { key?: React.Key; part: AssistantPart & { type: "tool" } }) {
  if (part.status === "started") return null;
  return <ToolDisplay toolName={part.toolName} input={part.input} isFailed={part.status === "failed"} />;
}

// Tool item renderer (for legacy ToolMessage from history)
function ToolItem({ tool }: { tool: ToolMessage }) {
  if (tool.status === "started") return null;
  return <ToolDisplay toolName={tool.toolName} input={tool.input} isFailed={tool.status === "failed"} />;
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
        <Text style={styles.responseText} selectable>{result.result}</Text>
      )}
      {result.durationMs !== undefined && (
        <Text style={styles.metaText}>
          {`${result.durationMs}ms`}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  messageContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  responseText: {
    color: "rgba(255,255,255,0.95)",
    fontSize: TYPOGRAPHY.SIZE_LG,
    lineHeight: 22,
  },
  resultContainer: {
    marginTop: SPACING.SM,
  },
  partsContainer: {
    // Container for interleaved parts
  },
  interruptedText: {
    color: COLORS.TEXT_MUTED,
    fontSize: TYPOGRAPHY.SIZE_XS + 1, // 12px
    fontStyle: "italic",
    marginTop: SPACING.XS,
  },
  metaText: {
    color: COLORS.TEXT_MUTED,
    fontSize: TYPOGRAPHY.SIZE_XS + 1, // 12px
    marginTop: SPACING.SM + 2, // 10px
  },
  errorContainer: {
    backgroundColor: "rgba(255,59,48,0.15)",
    borderRadius: SPACING.MD,
    padding: SPACING.MD,
    marginVertical: SPACING.SM - 2, // 6px
  },
  errorText: {
    color: "#FF6B6B",
    fontSize: TYPOGRAPHY.SIZE_MD,
  },
  systemContainer: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: SPACING.MD,
    padding: SPACING.MD,
    marginVertical: SPACING.SM - 2, // 6px
  },
  systemText: {
    color: COLORS.TEXT_TERTIARY,
    fontSize: TYPOGRAPHY.SIZE_MD,
    fontStyle: "italic",
  },
  toolLine: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: SPACING.XS,
  },
  toolLabel: {
    color: COLORS.TEXT_MUTED,
    fontSize: TYPOGRAPHY.SIZE_XS + 1, // 12px
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginRight: SPACING.SM,
    minWidth: 36,
  },
  toolLabelFailed: {
    color: "rgba(255,100,100,0.6)",
    fontSize: TYPOGRAPHY.SIZE_XS + 1, // 12px
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginRight: SPACING.SM,
    minWidth: 36,
  },
  toolValue: {
    color: "rgba(255,255,255,0.7)",
    fontSize: TYPOGRAPHY.SIZE_SM,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    flexShrink: 1,
  },
  toolValueFailed: {
    color: "rgba(255,100,100,0.7)",
    fontSize: TYPOGRAPHY.SIZE_SM,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    flexShrink: 1,
  },
  userPromptContainer: {
    backgroundColor: "rgba(0,122,255,0.15)",
    borderRadius: LAYOUT.BORDER_RADIUS_SM + 2, // 16px
    padding: SPACING.MD,
    marginVertical: SPACING.SM,
    alignSelf: "flex-end",
    maxWidth: "85%",
  },
  userPromptPending: {
    opacity: 0.7,
  },
  userPromptText: {
    color: COLORS.TEXT_PRIMARY,
    fontSize: TYPOGRAPHY.SIZE_LG,
    lineHeight: 20,
  },
  userImages: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.SM,
    marginBottom: SPACING.SM,
  },
  userImageThumb: {
    width: 80,
    height: 80,
    borderRadius: SPACING.SM,
    backgroundColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
});
