import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, StyleSheet, NativeModules, TouchableOpacity, Animated, Easing, Linking } from "react-native";
import { PromptInput } from "./components/PromptInput";
import { ResponseArea } from "./components/ResponseArea";
import { GitChangesTab } from "./components/GitChangesTab";
import {
  createWebSocketClient,
  getWebSocketClient,
  type ServerMessage,
  type ConnectionStatus,
  type GitChange,
} from "./services/websocket";
import { requestPushToken, setupTapHandler } from "./services/notifications";

// WidgetBridge is a simple native module available in the widget runtime
// ExpoAir is the main app's module (fallback)
const { WidgetBridge, ExpoAir } = NativeModules;

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

type TabType = "chat" | "changes";

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
  const [branchName, setBranchName] = useState<string>("main");
  const [gitChanges, setGitChanges] = useState<GitChange[]>([]);
  const [hasPR, setHasPR] = useState(false);
  const [prUrl, setPrUrl] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<TabType>("chat");
  const pushTokenSentRef = useRef(false);

  // Extract PR number from URL (e.g., "https://github.com/org/repo/pull/12" → "12")
  const prNumber = prUrl?.match(/\/pull\/(\d+)/)?.[1];

  // Initialize WebSocket connection immediately (even when collapsed)
  // so it's already connected when user expands the widget
  useEffect(() => {
    console.log("[expo-air] Connecting to:", serverUrl);
    const client = createWebSocketClient({
      url: serverUrl,
      onStatusChange: setStatus,
      onMessage: handleMessage,
      onError: (error) => {
        console.error("[expo-air] WebSocket error:", error);
      },
    });
    client.connect();

    return () => {
      client.disconnect();
    };
  }, [serverUrl]);

  // Setup notification tap handler (dev-only, expands widget on tap)
  useEffect(() => {
    const cleanup = setupTapHandler((promptId, success) => {
      // When user taps notification, ensure WebSocket is connected
      const client = getWebSocketClient();
      if (client && !client.isConnected()) {
        client.connect();
      }
      // The native side handles expanding the widget when app opens from notification
    });
    return cleanup;
  }, []);

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
      case "session_cleared":
        // Clear all messages for new session
        setMessages([]);
        setCurrentResponse("");
        break;
      case "stopped":
        // Query was stopped, keep messages
        break;
      case "history":
        // Convert history entries to displayable messages
        const historyMessages: ServerMessage[] = message.entries.map((entry) => {
          if (entry.role === "user") {
            return {
              type: "user_prompt" as const,
              content: entry.content,
              timestamp: entry.timestamp,
            };
          } else {
            return {
              type: "history_result" as const,
              content: entry.content,
              timestamp: entry.timestamp,
            };
          }
        });
        setMessages(historyMessages);
        break;
      case "git_status":
        // Update branch name, git changes, and PR status
        setBranchName(message.branchName);
        setGitChanges(message.changes);
        setHasPR(message.hasPR);
        setPrUrl(message.prUrl);
        break;
    }
  }, []);

  const handleSubmit = useCallback(async (prompt: string) => {
    // Request push token on first submit (dev-only, lazy permission)
    if (!pushTokenSentRef.current) {
      const token = await requestPushToken();
      if (token) {
        const client = getWebSocketClient();
        if (client?.isConnected()) {
          client.sendPushToken(token);
          pushTokenSentRef.current = true;
        }
      }
    }

    // Add user prompt to messages for display
    setMessages((prev) => [
      ...prev,
      {
        type: "user_prompt" as const,
        content: prompt,
        timestamp: Date.now(),
      },
    ]);
    setCurrentResponse("");

    const client = getWebSocketClient();
    if (client) {
      client.sendPrompt(prompt);
    }
  }, []);

  const handleNewSession = useCallback(() => {
    const client = getWebSocketClient();
    if (client) {
      client.requestNewSession();
    }
  }, []);

  const handleStop = useCallback(() => {
    const client = getWebSocketClient();
    if (client) {
      client.requestStop();
    }
  }, []);

  const handleCommit = useCallback(() => {
    setActiveTab("chat");
    handleSubmit("Look at my current git changes and create a commit with a good conventional commit message. Stage all changes and commit them.");
  }, [handleSubmit]);

  const handleCreatePR = useCallback(() => {
    setActiveTab("chat");
    handleSubmit("Create a pull request for my current branch. First commit any uncommitted changes with a good message. Then generate a title and description based on the commits, and use `gh pr create --title \"...\" --body \"...\"` (non-interactive mode) to create it. Push to remote first if needed.");
  }, [handleSubmit]);

  const handleViewPR = useCallback(() => {
    if (prUrl) {
      Linking.openURL(prUrl);
    }
  }, [prUrl]);

  const handleDiscard = useCallback(() => {
    const client = getWebSocketClient();
    if (client) {
      client.requestDiscardChanges();
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
      <Header
        status={status}
        branchName={branchName}
      />
      <TabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onNewSession={handleNewSession}
        canStartNew={status === "connected"}
        hasPR={hasPR}
        hasChanges={gitChanges.length > 0}
        prNumber={prNumber}
        onCreatePR={handleCreatePR}
        onCommit={handleCommit}
        onViewPR={handleViewPR}
      />
      <View style={styles.body}>
        {activeTab === "chat" ? (
          <ResponseArea messages={messages} currentResponse={currentResponse} />
        ) : (
          <GitChangesTab changes={gitChanges} onDiscard={handleDiscard} />
        )}
      </View>
      {activeTab === "chat" && (
        <PromptInput
          onSubmit={handleSubmit}
          onStop={handleStop}
          disabled={status === "disconnected"}
          isProcessing={status === "processing"}
        />
      )}
    </View>
  );
}

interface HeaderProps {
  status: ConnectionStatus;
  branchName: string;
}

function Header({ status, branchName }: HeaderProps) {
  const statusColors = {
    disconnected: "#FF3B30",
    connecting: "#007AFF",
    connected: "#30D158",
    processing: "#007AFF",
  };

  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={handleCollapse} style={styles.closeButton}>
        <Text style={styles.closeButtonText}>✕</Text>
      </TouchableOpacity>

      <Text style={styles.branchName} numberOfLines={1}>
        {branchName}
      </Text>

      <View style={[styles.statusDot, { backgroundColor: statusColors[status] }]} />
    </View>
  );
}

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

function TabBar({
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

interface BreathingButtonProps {
  children: React.ReactNode;
  onPress: () => void;
}

function BreathingButton({ children, onPress }: BreathingButtonProps) {
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
      <Animated.Text style={[styles.ctaText, { opacity: opacityAnim }]}>
        {children}
      </Animated.Text>
    </TouchableOpacity>
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
  // Expanded panel - fills native container (which handles width/centering)
  expanded: {
    flex: 1,
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
  branchName: {
    flex: 1,
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    fontWeight: "500",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  ctaButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  ctaButtonDisabled: {
    opacity: 0.4,
  },
  ctaText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  ctaTextDisabled: {
    opacity: 0.6,
  },
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  tabButtons: {
    flexDirection: "row",
    gap: 20,
  },
  tabText: {
    fontSize: 15,
    fontWeight: "500",
  },
  tabTextActive: {
    color: "#fff",
  },
  tabTextInactive: {
    color: "rgba(255,255,255,0.4)",
  },
  body: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
});
