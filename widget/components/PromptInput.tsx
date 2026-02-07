import React, { useState, useRef, useImperativeHandle, forwardRef } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { SPACING, LAYOUT, COLORS, TYPOGRAPHY, SIZES } from "../constants/design";

export interface PromptInputHandle {
  focus: () => void;
}

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isProcessing?: boolean;
}

export const PromptInput = forwardRef<PromptInputHandle, PromptInputProps>(({
  onSubmit,
  onStop,
  disabled = false,
  isProcessing = false,
}, ref) => {
  const [text, setText] = useState("");
  const inputRef = useRef<TextInput>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (trimmed && !disabled && !isProcessing) {
      onSubmit(trimmed);
      setText("");
    }
  };

  // Input stays editable, but submit button disabled when disconnected
  const canSubmit = text.trim().length > 0 && !disabled && !isProcessing;

  return (
    <View style={styles.container}>
      <TextInput
        ref={inputRef}
        style={styles.input}
        placeholder="Ask Claude..."
        placeholderTextColor={COLORS.TEXT_TERTIARY}
        value={text}
        onChangeText={setText}
        onSubmitEditing={handleSubmit}
        editable={!isProcessing}
        multiline
        maxLength={2000}
        returnKeyType="send"
        blurOnSubmit
      />
      {isProcessing ? (
        <TouchableOpacity
          style={[styles.submitButton, styles.stopButton]}
          onPress={onStop}
          activeOpacity={0.7}
        >
          <StopIcon />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.7}
        >
          <ArrowIcon />
        </TouchableOpacity>
      )}
    </View>
  );
});

function ArrowIcon() {
  return (
    <View style={styles.arrowIcon}>
      <View style={styles.arrowLine} />
      <View style={styles.arrowHead} />
    </View>
  );
}

function StopIcon() {
  return <View style={styles.stopIcon} />;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: LAYOUT.CONTENT_PADDING_H,
    paddingVertical: SPACING.MD,
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER,
    backgroundColor: COLORS.BACKGROUND,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND_INPUT,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: SPACING.MD,
    color: COLORS.TEXT_PRIMARY,
    fontSize: TYPOGRAPHY.SIZE_LG,
    maxHeight: 100,
  },
  submitButton: {
    width: SIZES.SUBMIT_BUTTON,
    height: SIZES.SUBMIT_BUTTON,
    borderRadius: SIZES.SUBMIT_BUTTON / 2,
    backgroundColor: COLORS.BACKGROUND_BUTTON,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: SPACING.SM + 2, // 10px
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  stopButton: {
    backgroundColor: COLORS.STATUS_NEUTRAL,
  },
  stopIcon: {
    width: 12,
    height: 12,
    backgroundColor: COLORS.TEXT_PRIMARY,
    borderRadius: 2,
  },
  arrowIcon: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowLine: {
    width: 2,
    height: 10,
    backgroundColor: COLORS.TEXT_PRIMARY,
    borderRadius: 1,
  },
  arrowHead: {
    position: "absolute",
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: COLORS.TEXT_PRIMARY,
  },
});
