import React, { useRef, useEffect } from "react";
import { View, Text, StyleSheet, NativeModules, TouchableOpacity, Animated, Easing, type TextStyle, type ViewProps } from "react-native";
import type { ConnectionStatus } from "../services/websocket";
import { SPACING, LAYOUT, COLORS, TYPOGRAPHY, SIZES } from "../constants/design";

// Typed animated components for React 19 compatibility
const AnimatedView = Animated.View as React.ComponentClass<Animated.AnimatedProps<ViewProps>>;

// WidgetBridge is a simple native module available in the widget runtime
// ExpoAir is the main app's module (fallback)
const { WidgetBridge, ExpoAir } = NativeModules;

function handleReload() {
  try {
    if (WidgetBridge?.reloadMainApp) {
      console.log("[expo-air] Triggering main app reload");
      WidgetBridge.reloadMainApp();
    } else {
      console.warn("[expo-air] No reloadMainApp method available");
    }
  } catch (e) {
    console.warn("[expo-air] Failed to reload main app:", e);
  }
}

function handleCollapse() {
  try {
    // Try WidgetBridge first (widget runtime), then ExpoAir (main app)
    if (WidgetBridge?.collapse) {
      WidgetBridge.collapse();
    } else if (ExpoAir?.collapse) {
      ExpoAir.collapse();
    } else {
      console.warn("[expo-air] No collapse method available");
    }
  } catch (e) {
    console.warn("[expo-air] Failed to collapse:", e);
  }
}

interface ActionConfig {
  label: string;
  textStyle?: TextStyle;
}

interface HeaderProps {
  status: ConnectionStatus;
  branchName: string;
  onBranchPress: () => void;
  action?: ActionConfig;
  onActionPress?: () => void;
}

export function Header({ status, branchName, onBranchPress, action, onActionPress }: HeaderProps) {
  const statusColors: Record<ConnectionStatus, string> = {
    disconnected: COLORS.STATUS_ERROR,
    connecting: COLORS.STATUS_INFO,
    connected: COLORS.STATUS_SUCCESS,
    sending: COLORS.STATUS_INFO,
    processing: COLORS.STATUS_INFO,
  };

  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={handleCollapse} onLongPress={handleReload} delayLongPress={500} style={styles.closeButton}>
        <Text style={styles.closeButtonText}>✕</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.branchButton} onPress={onBranchPress} disabled={!branchName}>
        {branchName ? (
          <>
            <Text style={styles.branchName} numberOfLines={1}>
              {branchName}
            </Text>
            <Text style={styles.branchChevron}>▾</Text>
          </>
        ) : (
          <View style={styles.branchLoadingBar} />
        )}
      </TouchableOpacity>

      {action && (
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onActionPress}
          activeOpacity={0.7}
        >
          <Text style={[styles.actionButtonText, action.textStyle]} numberOfLines={1}>
            {action.label}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        onLongPress={handleReload}
        delayLongPress={500}
        activeOpacity={0.6}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.statusDotTouchable}
      >
        <View style={[styles.statusDot, { backgroundColor: statusColors[status] }]} />
      </TouchableOpacity>
    </View>
  );
}

export function PulsingIndicator({ status }: { status: ConnectionStatus }) {
  const colors: Record<ConnectionStatus, string> = {
    disconnected: COLORS.STATUS_ERROR,
    connecting: COLORS.STATUS_INFO,
    connected: COLORS.STATUS_SUCCESS,
    sending: COLORS.STATUS_INFO,
    processing: COLORS.STATUS_INFO,
  };

  const isAnimating = status === "processing" || status === "connecting" || status === "sending";

  // Animated values for the pulsing ring
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (isAnimating) {
      // Create a soft pulsing animation
      const pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(scaleAnim, {
              toValue: 1.3,
              duration: 1200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 0,
              duration: 1200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(scaleAnim, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 0.4,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      pulseAnimation.start();
      return () => pulseAnimation.stop();
    } else {
      // Reset when not animating
      scaleAnim.setValue(1);
      opacityAnim.setValue(0.4);
    }
  }, [isAnimating, scaleAnim, opacityAnim]);

  return (
    <View style={styles.indicatorContainer}>
      <View
        style={[
          styles.indicator,
          { backgroundColor: colors[status] },
        ]}
      />
      {isAnimating && (
        <AnimatedView
          style={[
            styles.indicatorRing,
            {
              borderColor: colors[status],
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: LAYOUT.CONTENT_PADDING_H,
    paddingVertical: SPACING.MD + 2, // 14px for comfortable header height
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  closeButton: {
    width: SIZES.CLOSE_BUTTON,
    height: SIZES.CLOSE_BUTTON,
    borderRadius: SIZES.CLOSE_BUTTON / 2,
    // Make invisible - native close button handles the tap
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.MD,
  },
  closeButtonText: {
    // Hide the text - native button shows the X
    color: "transparent",
    fontSize: TYPOGRAPHY.SIZE_MD,
    fontWeight: TYPOGRAPHY.WEIGHT_SEMIBOLD,
  },
  branchButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  branchName: {
    flexShrink: 1,
    color: COLORS.TEXT_SECONDARY,
    fontSize: TYPOGRAPHY.SIZE_MD,
    fontWeight: TYPOGRAPHY.WEIGHT_MEDIUM,
  },
  branchChevron: {
    color: COLORS.TEXT_MUTED,
    fontSize: TYPOGRAPHY.SIZE_SM,
    marginLeft: SPACING.XS,
  },
  branchLoadingBar: {
    width: 80,
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  actionButton: {
    backgroundColor: COLORS.BACKGROUND_INTERACTIVE,
    borderRadius: LAYOUT.BORDER_RADIUS_MD,
    paddingHorizontal: SIZES.CTA_PADDING_H,
    paddingVertical: SIZES.CTA_PADDING_V,
    marginLeft: SPACING.SM,
  },
  actionButtonText: {
    color: COLORS.TEXT_SECONDARY,
    fontSize: TYPOGRAPHY.SIZE_SM,
    fontWeight: TYPOGRAPHY.WEIGHT_MEDIUM,
  },
  statusDot: {
    width: SIZES.STATUS_DOT,
    height: SIZES.STATUS_DOT,
    borderRadius: SIZES.STATUS_DOT / 2,
    marginLeft: SPACING.MD,
  },
  statusDotTouchable: {
    marginLeft: SPACING.MD,
    padding: 10,
  },
  collapsedPill: {
    width: 100,
    height: 32,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  indicatorContainer: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  indicator: {
    width: SIZES.STATUS_DOT,
    height: SIZES.STATUS_DOT,
    borderRadius: SIZES.STATUS_DOT / 2,
  },
  indicatorRing: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    opacity: 0.4,
  },
});
