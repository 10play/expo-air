import React from "react";
import { View, Text, StyleSheet, Platform, Linking } from "react-native";
import { SPACING, COLORS, TYPOGRAPHY } from "../constants/design";

// Renders formatted text with markdown-style lists, code, and emphasis
export function FormattedText({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
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

const styles = StyleSheet.create({
  formattedContainer: {
    flexDirection: "column",
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
});
