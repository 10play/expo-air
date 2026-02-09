import React, { useRef, useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, NativeScrollEvent, Keyboard, Platform } from "react-native";
import type { ServerMessage, AssistantPart } from "../services/websocket";
import { MessageItem, PartsRenderer } from "./MessageItems";
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
  const handleScroll = useCallback(
    (event: { nativeEvent: NativeScrollEvent }) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - layoutMeasurement.height - contentOffset.y;
      setIsAtBottom(distanceFromBottom < 50);
    },
    [],
  );

  // Track content size changes
  const handleContentSizeChange = useCallback(
    (width: number, height: number) => {
      contentHeightRef.current = height;
    },
    [],
  );

  // Track scroll view layout
  const handleLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      scrollViewHeightRef.current = event.nativeEvent.layout.height;
    },
    [],
  );

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
    const keyboardEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
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
        <TouchableOpacity
          style={styles.scrollButton}
          onPress={scrollToBottom}
          activeOpacity={0.8}
        >
          <Text style={styles.scrollButtonText}>↓</Text>
        </TouchableOpacity>
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
