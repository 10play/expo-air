import React, { useRef, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, type TextProps } from "react-native";
import { SPACING, LAYOUT, COLORS, TYPOGRAPHY, SIZES } from "../constants/design";

// Typed animated components for React 19 compatibility
const AnimatedText = Animated.Text as React.ComponentClass<Animated.AnimatedProps<TextProps>>;

export type TabType = "chat" | "changes";

interface TabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onNewSession: () => void;
  canStartNew: boolean;
  hasPR: boolean;
  hasChanges: boolean;
  prNumber?: string;
  onCreatePR: () => void;
  onCommit: () => void;
  onViewPR: () => void;
}

export function TabBar({
  activeTab,
  onTabChange,
  onNewSession,
  canStartNew,
  hasPR,
  hasChanges,
  prNumber,
  onCreatePR,
  onCommit,
  onViewPR,
}: TabBarProps) {
  // Determine which CTA to show for Changes tab
  const renderCTA = () => {
    if (activeTab === "chat") {
      return (
        <TouchableOpacity
          onPress={onNewSession}
          style={[styles.ctaButton, !canStartNew && styles.ctaButtonDisabled]}
          disabled={!canStartNew}
        >
          <Text style={[styles.ctaText, !canStartNew && styles.ctaTextDisabled]}>New</Text>
        </TouchableOpacity>
      );
    }

    // Changes tab - show smart CTA with breathing animation
    if (!hasPR && hasChanges) {
      return <BreathingButton onPress={onCreatePR}>Create PR</BreathingButton>;
    }
    if (hasPR && hasChanges) {
      return <BreathingButton onPress={onCommit}>Commit</BreathingButton>;
    }
    if (hasPR && !hasChanges && prNumber) {
      return <BreathingButton onPress={onViewPR}>#{prNumber}</BreathingButton>;
    }
    return null; // no PR + no changes = nothing
  };

  return (
    <View style={styles.tabBar}>
      <View style={styles.tabButtons}>
        <TouchableOpacity onPress={() => onTabChange("chat")}>
          <Text style={[
            styles.tabText,
            activeTab === "chat" ? styles.tabTextActive : styles.tabTextInactive
          ]}>
            Chat
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onTabChange("changes")}>
          <Text style={[
            styles.tabText,
            activeTab === "changes" ? styles.tabTextActive : styles.tabTextInactive
          ]}>
            Changes
          </Text>
        </TouchableOpacity>
      </View>
      {renderCTA()}
    </View>
  );
}

function BreathingButton({ children, onPress }: React.PropsWithChildren<{ onPress: () => void }>) {
  const opacityAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacityAnim, {
          toValue: 0.9,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.6,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacityAnim]);

  return (
    <TouchableOpacity onPress={onPress} style={styles.ctaButton} activeOpacity={0.7}>
      <AnimatedText style={[styles.ctaText, { opacity: opacityAnim }]}>
        {children}
      </AnimatedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: LAYOUT.CONTENT_PADDING_H,
    paddingVertical: SPACING.SM + 2, // 10px
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  tabButtons: {
    flexDirection: "row",
    gap: SPACING.XL,
  },
  tabText: {
    fontSize: TYPOGRAPHY.SIZE_LG,
    fontWeight: TYPOGRAPHY.WEIGHT_MEDIUM,
  },
  tabTextActive: {
    color: COLORS.TEXT_PRIMARY,
  },
  tabTextInactive: {
    color: COLORS.TEXT_MUTED,
  },
  ctaButton: {
    paddingHorizontal: SIZES.CTA_PADDING_H,
    paddingVertical: SIZES.CTA_PADDING_V,
    borderRadius: LAYOUT.BORDER_RADIUS_SM,
    backgroundColor: COLORS.BACKGROUND_INTERACTIVE,
  },
  ctaButtonDisabled: {
    opacity: 0.4,
  },
  ctaText: {
    color: COLORS.TEXT_PRIMARY,
    fontSize: TYPOGRAPHY.SIZE_SM,
    fontWeight: TYPOGRAPHY.WEIGHT_SEMIBOLD,
  },
  ctaTextDisabled: {
    opacity: 0.6,
  },
});
