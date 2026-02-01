import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, StyleSheet, NativeModules, TouchableOpacity, Animated, Easing } from "react-native";
import { PromptInput } from "./components/PromptInput";
import { ResponseArea } from "./components/ResponseArea";
import {
  createWebSocketClient,
  getWebSocketClient,
  type ServerMessage,
  type ConnectionStatus,
} from "./services/websocket";

// WidgetBridge is a simple native module available in the widget runtime
// ExpoFlow is the main app's module (fallback)
const { WidgetBridge, ExpoFlow } = NativeModules;

function handleCollapse() {
  try {
    // Try WidgetBridge first (widget runtime), then ExpoFlow (main app)
    if (WidgetBridge?.collapse) {
      WidgetBridge.collapse();
    } else if (ExpoFlow?.collapse) {
      ExpoFlow.collapse();
    } else {
      console.warn("[expo-flow] No collapse method available");
    }
  } catch (e) {
    console.warn("[expo-flow] Failed to collapse:", e);
  }
}

interface BubbleContentProps {
  size?: number;
  color?: string;
  expanded?: boolean;
  serverUrl?: string;
}

export function BubbleContent({
  size = 60,
  color = "#000000",  // Black to match Dynamic Island
  expanded = false,
  serverUrl = "ws://localhost:3847",
}: BubbleContentProps) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [messages, setMessages] = useState<ServerMessage[]>([]);
  const [currentResponse, setCurrentResponse] = useState("");

  // Initialize WebSocket connection immediately (even when collapsed)
  // so it's already connected when user expands the widget
  useEffect(() => {
    console.log("[expo-flow] Connecting to:", serverUrl);
    const client = createWebSocketClient({
      url: serverUrl,
      onStatusChange: setStatus,
      onMessage: handleMessage,
      onError: (error) => {
        console.error("[expo-flow] WebSocket error:", error);
      },
    });
    client.connect();

    return () => {
      client.disconnect();
    };
  }, [serverUrl]);

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case "stream":
        if (!message.done) {
          setCurrentResponse((prev) => prev + message.chunk);
        }
        break;
      case "result":
        // Finalize the response
        setMessages((prev) => [...prev, message]);
        setCurrentResponse("");
        break;
      case "error":
        setMessages((prev) => [...prev, message]);
        setCurrentResponse("");
        break;
      case "tool":
        setMessages((prev) => [...prev, message]);
        break;
      case "status":
        // Status is handled by the status indicator
        break;
    }
  }, []);

  const handleSubmit = useCallback((prompt: string) => {
    // Clear previous messages for new prompt
    setMessages([]);
    setCurrentResponse("");

    const client = getWebSocketClient();
    if (client) {
      client.sendPrompt(prompt);
    }
  }, []);

  // Collapsed: Just a pulsing indicator, no text
  if (!expanded) {
    return (
      <View style={styles.collapsedPill}>
        <PulsingIndicator status={status} />
      </View>
    );
  }

  // Expanded: Full panel dropping down from Dynamic Island position
  return (
    <View style={styles.expanded}>
      <Header status={status} />
      <View style={styles.body}>
        <ResponseArea messages={messages} currentResponse={currentResponse} />
      </View>
      <PromptInput
        onSubmit={handleSubmit}
        disabled={status === "disconnected"}
        isProcessing={status === "processing"}
      />
    </View>
  );
}

function Header({ status }: { status: ConnectionStatus }) {
  const statusConfig = {
    disconnected: { text: "Disconnected", color: "#FF3B30" },
    connecting: { text: "Connecting...", color: "#007AFF" },
    connected: { text: "Connected", color: "#30D158" },
    processing: { text: "Claude is working...", color: "#007AFF" },
  };

  const { text, color } = statusConfig[status];

  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={handleCollapse} style={styles.closeButton}>
        <Text style={styles.closeButtonText}>✕</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Expo Flow</Text>
      <View style={styles.statusContainer}>
        <View style={[styles.statusIndicator, { backgroundColor: color }]} />
        <Text style={styles.statusText}>{text}</Text>
      </View>
    </View>
  );
}

function PulsingIndicator({ status }: { status: ConnectionStatus }) {
  const colors = {
    disconnected: "#FF3B30",
    connecting: "#007AFF",
    connected: "#30D158",
    processing: "#007AFF",
  };

  const isAnimating = status === "processing" || status === "connecting";

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
        <Animated.View
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
  // Collapsed: just show centered indicator
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
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  indicatorRing: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    opacity: 0.4,
  },
  // Expanded panel - drops down from Dynamic Island position
  expanded: {
    width: 340,
    height: 420,
    backgroundColor: "#000",
    borderRadius: 32,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    // Make invisible - native close button handles the tap
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  closeButtonText: {
    // Hide the text - native button shows the X
    color: "transparent",
    fontSize: 14,
    fontWeight: "600",
  },
  title: {
    flex: 1,
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
  },
  body: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
});
