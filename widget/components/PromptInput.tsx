import React, { useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
  isProcessing?: boolean;
}

export function PromptInput({
  onSubmit,
  disabled = false,
  isProcessing = false,
}: PromptInputProps) {
  const [text, setText] = useState("");

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (trimmed && !disabled && !isProcessing) {
      onSubmit(trimmed);
      setText("");
    }
  };

  const canSubmit = text.trim().length > 0 && !disabled && !isProcessing;

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Ask Claude..."
        placeholderTextColor="rgba(255,255,255,0.5)"
        value={text}
        onChangeText={setText}
        onSubmitEditing={handleSubmit}
        editable={!disabled && !isProcessing}
        multiline
        maxLength={2000}
        returnKeyType="send"
        blurOnSubmit
      />
      <TouchableOpacity
        style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit}
        activeOpacity={0.7}
      >
        {isProcessing ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <ArrowIcon />
        )}
      </TouchableOpacity>
    </View>
  );
}

function ArrowIcon() {
  return (
    <View style={styles.arrowIcon}>
      <View style={styles.arrowLine} />
      <View style={styles.arrowHead} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#000",
  },
  input: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
    color: "#fff",
    fontSize: 15,
    maxHeight: 100,
  },
  submitButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  submitButtonDisabled: {
    opacity: 0.4,
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
    backgroundColor: "#fff",
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
    borderBottomColor: "#fff",
  },
});
