import React, { useRef, useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, NativeScrollEvent, Keyboard, Platform, Image, Linking } from "react-native";
import type { ServerMessage, ToolMessage, ResultMessage, UserPromptMessage, HistoryResultMessage, SystemDisplayMessage, AssistantPart, AssistantPartsMessage } from "../services/websocket";
import { SPACING, LAYOUT, COLORS, TYPOGRAPHY } from "../constants/design";

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
  const handleScroll = useCallback((event: { nativeEvent: NativeScrollEvent }) => {
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

function MessageItem({ message }: { key?: React.Key; message: ServerMessage }) {
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

function UserPromptItem({ message }: { message: UserPromptMessage }) {
  return (
    <View style={styles.userPromptContainer}>
      {message.images && message.images.length > 0 && (
        <View style={styles.userImages}>
          {message.images.map((img, i) => (
            <Image key={i} source={{ uri: img.uri }} style={styles.userImageThumb} />
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

// Renders formatted text with markdown-style lists, code, and emphasis
function FormattedText({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code block start (check first to avoid matching content inside code blocks)
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      const lang = trimmed.slice(3).trim();
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <View key={`code-${i}`} style={styles.codeBlock}>
          {lang && <Text style={styles.codeLang}>{lang}</Text>}
          <Text style={styles.codeText} selectable>{codeLines.join('\n')}</Text>
        </View>
      );
      i++; // skip closing ```
      continue;
    }

    // Heading (# ## ### etc.)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingStyle = level <= 2 ? styles.heading1 : level <= 4 ? styles.heading2 : styles.heading3;
      elements.push(
        <Text key={i} style={headingStyle} selectable>{formatInlineText(headingMatch[2])}</Text>
      );
      i++;
      continue;
    }

    // Blockquote (> text) - collect consecutive > lines
    if (trimmed.startsWith('> ') || trimmed === '>') {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith('> ') || lines[i].trim() === '>')) {
        const qContent = lines[i].trim().startsWith('> ') ? lines[i].trim().slice(2) : '';
        quoteLines.push(qContent);
        i++;
      }
      elements.push(
        <View key={`quote-${i}`} style={styles.blockquote}>
          <Text style={styles.blockquoteText} selectable>{formatInlineText(quoteLines.join('\n'))}</Text>
        </View>
      );
      continue;
    }

    // Task list item (- [ ] or - [x])
    const taskMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (taskMatch) {
      const checked = taskMatch[1] !== ' ';
      elements.push(
        <View key={i} style={styles.listItem}>
          <Text style={styles.listBullet}>{checked ? '☑' : '☐'}</Text>
          <Text style={styles.listText} selectable>{formatInlineText(taskMatch[2])}</Text>
        </View>
      );
      i++;
      continue;
    }

    // Numbered list item (1. 2. 3.) - with nesting via indentation
    const numberedMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (numberedMatch) {
      const indent = Math.floor(numberedMatch[1].length / 2);
      const [, , num, text] = numberedMatch;
      elements.push(
        <View key={i} style={[styles.listItem, indent > 0 && { paddingLeft: SPACING.SM + indent * SPACING.LG }]}>
          <Text style={styles.listNumber}>{num}.</Text>
          <Text style={styles.listText} selectable>{formatInlineText(text)}</Text>
        </View>
      );
      i++;
      continue;
    }

    // Bullet list item (- or *) - with nesting via indentation
    const bulletMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
    if (bulletMatch) {
      const indent = Math.floor(bulletMatch[1].length / 2);
      const bulletChar = indent === 0 ? '•' : indent === 1 ? '◦' : '▪';
      elements.push(
        <View key={i} style={[styles.listItem, indent > 0 && { paddingLeft: SPACING.SM + indent * SPACING.LG }]}>
          <Text style={styles.listBullet}>{bulletChar}</Text>
          <Text style={styles.listText} selectable>{formatInlineText(bulletMatch[2])}</Text>
        </View>
      );
      i++;
      continue;
    }

    // Horizontal rule (---, ***, ___)
    if (/^[-*_]{3,}$/.test(trimmed)) {
      elements.push(<View key={i} style={styles.horizontalRule} />);
      i++;
      continue;
    }

    // Empty line = paragraph break
    if (!trimmed) {
      elements.push(<View key={i} style={styles.paragraphBreak} />);
      i++;
      continue;
    }

    // Regular text
    elements.push(
      <Text key={i} style={styles.responseText} selectable>{formatInlineText(line)}</Text>
    );
    i++;
  }

  return (
    <View style={styles.formattedContainer}>
      {elements}
      {isStreaming && <View style={styles.cursor} />}
    </View>
  );
}

// Format inline elements: code spans first, then links, then emphasis
function formatInlineText(text: string): React.ReactNode {
  // Split on inline code first to avoid processing markdown inside code spans
  const codeParts = text.split(/(`[^`]+`)/g);
  if (codeParts.length === 1) {
    return formatLinks(text);
  }

  return codeParts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <Text key={i} style={styles.inlineCode}>{part.slice(1, -1)}</Text>;
    }
    return <React.Fragment key={i}>{formatLinks(part)}</React.Fragment>;
  });
}

// Format markdown links [text](url)
function formatLinks(text: string): React.ReactNode {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  if (parts.length === 1) return formatEmphasis(text);

  return parts.map((part, i) => {
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <Text
          key={i}
          style={styles.linkText}
          onPress={() => Linking.openURL(linkMatch[2])}
        >
          {linkMatch[1]}
        </Text>
      );
    }
    return <React.Fragment key={i}>{formatEmphasis(part)}</React.Fragment>;
  });
}

// Format bold, italic, and strikethrough emphasis
function formatEmphasis(text: string): React.ReactNode {
  // Match **bold**, ~~strikethrough~~, *italic*, and plain text segments
  const parts = text.split(/(\*\*[^*]+\*\*|~~[^~]+~~|\*[^*]+\*)/g);
  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <Text key={i} style={styles.boldText}>{part.slice(2, -2)}</Text>;
    }
    if (part.startsWith('~~') && part.endsWith('~~')) {
      return <Text key={i} style={styles.strikethroughText}>{part.slice(2, -2)}</Text>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <Text key={i} style={styles.italicText}>{part.slice(1, -1)}</Text>;
    }
    return part;
  });
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
    backgroundColor: COLORS.BACKGROUND,
  },
  content: {
    padding: LAYOUT.CONTENT_PADDING_H,
    paddingBottom: SPACING.XXL,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.XXL,
  },
  emptyText: {
    color: COLORS.TEXT_MUTED,
    fontSize: TYPOGRAPHY.SIZE_LG,
    textAlign: "center",
    lineHeight: 22,
  },
  messageContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  responseText: {
    color: "rgba(255,255,255,0.95)",
    fontSize: TYPOGRAPHY.SIZE_LG,
    lineHeight: 22,
  },
  cursor: {
    width: 2,
    height: 18,
    backgroundColor: COLORS.TEXT_PRIMARY,
    marginLeft: 2,
    opacity: 0.7,
  },
  resultContainer: {
    marginTop: SPACING.SM,
  },
  partsContainer: {
    // Container for interleaved parts
  },
  formattedContainer: {
    flexDirection: "column",
  },
  listItem: {
    flexDirection: "row",
    marginVertical: SPACING.XS / 2,
    paddingLeft: SPACING.SM,
  },
  listNumber: {
    color: COLORS.TEXT_MUTED,
    fontSize: TYPOGRAPHY.SIZE_LG,
    lineHeight: 22,
    width: 24,
    fontWeight: TYPOGRAPHY.WEIGHT_MEDIUM,
  },
  listBullet: {
    color: COLORS.TEXT_MUTED,
    fontSize: TYPOGRAPHY.SIZE_LG,
    lineHeight: 22,
    width: 18,
  },
  listText: {
    flex: 1,
    color: "rgba(255,255,255,0.95)",
    fontSize: TYPOGRAPHY.SIZE_LG,
    lineHeight: 22,
  },
  codeBlock: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: SPACING.SM,
    padding: SPACING.MD,
    marginVertical: SPACING.SM,
  },
  codeLang: {
    color: COLORS.TEXT_MUTED,
    fontSize: TYPOGRAPHY.SIZE_XS,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginBottom: SPACING.XS,
    textTransform: "uppercase",
  },
  codeText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: TYPOGRAPHY.SIZE_SM,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 18,
  },
  inlineCode: {
    backgroundColor: "rgba(255,255,255,0.1)",
    color: "rgba(255,255,255,0.9)",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: TYPOGRAPHY.SIZE_MD,
    paddingHorizontal: 4,
    borderRadius: 3,
  },
  heading1: {
    color: COLORS.TEXT_PRIMARY,
    fontSize: TYPOGRAPHY.SIZE_XL,
    fontWeight: TYPOGRAPHY.WEIGHT_SEMIBOLD,
    lineHeight: 24,
    marginTop: SPACING.MD,
    marginBottom: SPACING.XS,
  },
  heading2: {
    color: "rgba(255,255,255,0.9)",
    fontSize: TYPOGRAPHY.SIZE_LG,
    fontWeight: TYPOGRAPHY.WEIGHT_SEMIBOLD,
    lineHeight: 22,
    marginTop: SPACING.SM,
    marginBottom: SPACING.XS,
  },
  heading3: {
    color: "rgba(255,255,255,0.85)",
    fontSize: TYPOGRAPHY.SIZE_LG,
    fontWeight: TYPOGRAPHY.WEIGHT_MEDIUM,
    lineHeight: 22,
    marginTop: SPACING.SM,
    marginBottom: SPACING.XS,
  },
  boldText: {
    fontWeight: TYPOGRAPHY.WEIGHT_SEMIBOLD,
    color: COLORS.TEXT_PRIMARY,
  },
  italicText: {
    fontStyle: "italic",
    color: "rgba(255,255,255,0.85)",
  },
  strikethroughText: {
    textDecorationLine: "line-through",
    color: COLORS.TEXT_MUTED,
  },
  linkText: {
    color: COLORS.STATUS_INFO,
    textDecorationLine: "underline",
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: "rgba(255,255,255,0.15)",
    paddingLeft: SPACING.MD,
    marginVertical: SPACING.XS,
  },
  blockquoteText: {
    color: COLORS.TEXT_SECONDARY,
    fontSize: TYPOGRAPHY.SIZE_LG,
    lineHeight: 22,
    fontStyle: "italic",
  },
  horizontalRule: {
    height: 1,
    backgroundColor: COLORS.BORDER,
    marginVertical: SPACING.MD,
  },
  paragraphBreak: {
    height: SPACING.SM,
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
  },
  scrollButton: {
    position: "absolute",
    bottom: LAYOUT.CONTENT_PADDING_H,
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
    color: COLORS.TEXT_PRIMARY,
    fontSize: 18,
    fontWeight: TYPOGRAPHY.WEIGHT_SEMIBOLD,
  },
});
