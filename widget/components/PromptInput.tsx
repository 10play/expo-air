import React, { useState, useRef, useImperativeHandle, forwardRef } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  Alert,
  NativeModules,
} from "react-native";
import { SPACING, LAYOUT, COLORS, TYPOGRAPHY, SIZES } from "../constants/design";

const WidgetBridge = NativeModules.WidgetBridge as any;
import type { ImageAttachment } from "../services/websocket";

export interface PromptInputHandle {
  focus: () => void;
}

interface PromptInputProps {
  onSubmit: (prompt: string, images?: ImageAttachment[]) => void;
  onStop?: () => void;
  disabled?: boolean;
  isProcessing?: boolean;
}

const MAX_IMAGES = 4;

export const PromptInput = forwardRef<PromptInputHandle, PromptInputProps>(({
  onSubmit,
  onStop,
  disabled = false,
  isProcessing = false,
}, ref) => {
  const [text, setText] = useState("");
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const inputRef = useRef<TextInput>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  const handleSubmit = () => {
    const trimmed = text.trim();
    const hasContent = trimmed.length > 0 || images.length > 0;
    if (hasContent && !disabled && !isProcessing) {
      onSubmit(trimmed, images.length > 0 ? images : undefined);
      setText("");
      setImages([]);
    }
  };

  const handlePickImages = async () => {
    if (images.length >= MAX_IMAGES) {
      Alert.alert("Limit reached", `Maximum ${MAX_IMAGES} images per message.`);
      return;
    }

    try {
      if (!WidgetBridge) {
        console.warn("[expo-air] WidgetBridge native module not available");
        return;
      }
      const results: ImageAttachment[] = await WidgetBridge.pickImages(MAX_IMAGES - images.length);
      if (results && results.length > 0) {
        setImages((prev) => [...prev, ...results].slice(0, MAX_IMAGES));
      }
    } catch (e) {
      console.warn("[expo-air] Image picker error:", e);
    }
  };

  const handlePasteImage = async () => {
    if (images.length >= MAX_IMAGES) {
      Alert.alert("Limit reached", `Maximum ${MAX_IMAGES} images per message.`);
      return;
    }

    try {
      if (!WidgetBridge) {
        console.warn("[expo-air] WidgetBridge native module not available");
        return;
      }
      const result: ImageAttachment | null = await WidgetBridge.getClipboardImage();
      if (!result) {
        Alert.alert("No image", "No image found on clipboard.");
        return;
      }
      setImages((prev) => [...prev, result].slice(0, MAX_IMAGES));
    } catch (e) {
      console.warn("[expo-air] Clipboard error:", e);
      Alert.alert("Error", "Failed to read clipboard image.");
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const canSubmit = (text.trim().length > 0 || images.length > 0) && !disabled && !isProcessing;

  return (
    <View style={styles.outerContainer}>
      {images.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.previewStrip}
          contentContainerStyle={styles.previewContent}
        >
          {images.map((img, index) => (
            <View key={index} style={styles.previewItem}>
              <Image source={{ uri: img.uri }} style={styles.previewImage} />
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeImage(index)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <View style={styles.removeIcon}>
                  <View style={[styles.removeLine, styles.removeLineA]} />
                  <View style={[styles.removeLine, styles.removeLineB]} />
                </View>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={handlePickImages}
          disabled={isProcessing}
          activeOpacity={0.6}
        >
          <PhotoIcon />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={handlePasteImage}
          disabled={isProcessing}
          activeOpacity={0.6}
        >
          <ClipboardIcon />
        </TouchableOpacity>
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
    </View>
  );
});

function PhotoIcon() {
  return (
    <View style={styles.photoIcon}>
      <View style={styles.photoBody} />
      <View style={styles.photoLens} />
    </View>
  );
}

function ClipboardIcon() {
  return (
    <View style={styles.clipboardIcon}>
      <View style={styles.clipboardBody} />
      <View style={styles.clipboardClip} />
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

function StopIcon() {
  return <View style={styles.stopIcon} />;
}

const styles = StyleSheet.create({
  outerContainer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER,
    backgroundColor: COLORS.BACKGROUND,
  },
  previewStrip: {
    maxHeight: 72,
    paddingHorizontal: LAYOUT.CONTENT_PADDING_H,
    paddingTop: SPACING.SM,
  },
  previewContent: {
    gap: SPACING.SM,
    alignItems: "center",
  },
  previewItem: {
    position: "relative",
  },
  previewImage: {
    width: 56,
    height: 56,
    borderRadius: SPACING.SM,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  removeButton: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255,59,48,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeIcon: {
    width: 10,
    height: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  removeLine: {
    position: "absolute",
    width: 10,
    height: 1.5,
    backgroundColor: "#fff",
    borderRadius: 1,
  },
  removeLineA: {
    transform: [{ rotate: "45deg" }],
  },
  removeLineB: {
    transform: [{ rotate: "-45deg" }],
  },
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: LAYOUT.CONTENT_PADDING_H,
    paddingVertical: SPACING.MD,
  },
  iconButton: {
    width: 32,
    height: SIZES.SUBMIT_BUTTON,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 2,
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
    marginLeft: SPACING.SM + 2,
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
  // Photo icon (camera shape)
  photoIcon: {
    width: 18,
    height: 14,
    justifyContent: "flex-end",
  },
  photoBody: {
    width: 18,
    height: 12,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: COLORS.TEXT_MUTED,
  },
  photoLens: {
    position: "absolute",
    top: 4,
    left: 5.5,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1.5,
    borderColor: COLORS.TEXT_MUTED,
  },
  // Clipboard icon
  clipboardIcon: {
    width: 14,
    height: 18,
    alignItems: "center",
  },
  clipboardBody: {
    width: 14,
    height: 16,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: COLORS.TEXT_MUTED,
    marginTop: 2,
  },
  clipboardClip: {
    position: "absolute",
    top: 0,
    width: 8,
    height: 4,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: COLORS.TEXT_MUTED,
    backgroundColor: COLORS.BACKGROUND,
  },
});
