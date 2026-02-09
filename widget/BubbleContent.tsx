import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, StyleSheet, NativeModules, TouchableOpacity, Animated, Easing, Linking, type TextProps, type ViewProps } from "react-native";
import { PromptInput, type PromptInputHandle } from "./components/PromptInput";
import { ResponseArea } from "./components/ResponseArea";
import { GitChangesTab } from "./components/GitChangesTab";
import {
  createWebSocketClient,
  getWebSocketClient,
  type ServerMessage,
  type ConnectionStatus,
  type GitChange,
  type BranchInfo,
  type AnyConversationEntry,
  type AssistantPart,
  type AssistantPartsMessage,
} from "./services/websocket";
import { requestPushToken, setupTapHandler } from "./services/notifications";
import { BranchSwitcher } from "./components/BranchSwitcher";
import { SPACING, LAYOUT, COLORS, TYPOGRAPHY, SIZES } from "./constants/design";

// Typed animated components for React 19 compatibility
const AnimatedText = Animated.Text as React.ComponentClass<Animated.AnimatedProps<TextProps>>;
const AnimatedView = Animated.View as React.ComponentClass<Animated.AnimatedProps<ViewProps>>;

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
  const [currentParts, setCurrentParts] = useState<AssistantPart[]>([]);
  const [branchName, setBranchName] = useState<string>("main");
  const [gitChanges, setGitChanges] = useState<GitChange[]>([]);
  const [hasPR, setHasPR] = useState(false);
  const [prUrl, setPrUrl] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<TabType>("chat");
  const [showBranchSwitcher, setShowBranchSwitcher] = useState(false);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [branchError, setBranchError] = useState<string | null>(null);
  const pushTokenSentRef = useRef(false);
  const partIdCounter = useRef(0);
  // Use refs to avoid stale closure issues in handleMessage callback
  const currentPartsRef = useRef<AssistantPart[]>([]);
  const currentPromptIdRef = useRef<string | null>(null);
  const promptInputRef = useRef<PromptInputHandle>(null);

  // Auto-focus input when widget expands
  useEffect(() => {
    if (expanded && activeTab === "chat") {
      // Small delay to ensure the component is mounted
      setTimeout(() => promptInputRef.current?.focus(), 100);
    }
  }, [expanded]);

  // Extract PR number from URL (e.g., "https://github.com/org/repo/pull/12" → "12")
  const prNumber = prUrl?.match(/\/pull\/(\d+)/)?.[1];

  // Initialize WebSocket connection immediately (even when collapsed)
  // so it's already connected when user expands the widget
  useEffect(() => {
    console.log("[expo-air] Connecting to:", serverUrl?.replace(/([?&])secret=[^&]+/, "$1secret=***"));
    const client = createWebSocketClient({
      url: serverUrl,
      onStatusChange: setStatus,
      onMessage: handleMessage,
      onError: (error) => {
        console.warn("[expo-air] WebSocket error:", error);
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

  // Helper to finalize current parts into a message
  const finalizeCurrentParts = useCallback((promptId: string, isComplete: boolean) => {
    const parts = currentPartsRef.current;
    if (parts.length > 0) {
      const partsMsg: AssistantPartsMessage = {
        type: "assistant_parts",
        promptId,
        parts,
        isComplete,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, partsMsg]);
    }
    currentPartsRef.current = [];
    currentPromptIdRef.current = null;
    setCurrentParts([]);
  }, []);

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case "stream":
        // Handle new prompt starting
        if (message.promptId !== currentPromptIdRef.current) {
          // New response - finalize any previous parts first
          if (currentPartsRef.current.length > 0 && currentPromptIdRef.current) {
            finalizeCurrentParts(currentPromptIdRef.current, false);
          }
          currentPromptIdRef.current = message.promptId;
        }
        // Add text chunk to current parts
        if (!message.done && message.chunk) {
          const parts = currentPartsRef.current;
          const lastPart = parts[parts.length - 1];
          if (lastPart?.type === "text") {
            // Append to existing text part
            lastPart.content += message.chunk;
            currentPartsRef.current = [...parts];
          } else {
            // Create new text part
            currentPartsRef.current = [...parts, {
              type: "text",
              id: `text-${partIdCounter.current++}`,
              content: message.chunk
            }];
          }
          setCurrentParts([...currentPartsRef.current]);
        }
        break;
      case "tool":
        // Only add completed/failed tools to parts (skip "started")
        if (message.status !== "started") {
          const toolPart: AssistantPart = {
            type: "tool",
            id: `tool-${partIdCounter.current++}`,
            toolName: message.toolName,
            status: message.status,
            input: message.input,
            output: message.output,
            timestamp: message.timestamp,
          };
          currentPartsRef.current = [...currentPartsRef.current, toolPart];
          setCurrentParts([...currentPartsRef.current]);
        }
        break;
      case "result":
        // Finalize parts into a message
        if (currentPartsRef.current.length > 0) {
          const partsMsg: AssistantPartsMessage = {
            type: "assistant_parts",
            promptId: message.promptId,
            parts: currentPartsRef.current,
            isComplete: true,
            timestamp: message.timestamp,
          };
          // Add result message for metadata (cost, duration) only — strip result.result
          // to avoid duplicating the content that's already in partsMsg with proper formatting
          const hasMetadata = message.costUsd !== undefined || message.durationMs !== undefined || (!message.success && message.error);
          if (hasMetadata) {
            const metadataOnly = { ...message, result: undefined };
            setMessages((prev) => [...prev, partsMsg, metadataOnly]);
          } else {
            setMessages((prev) => [...prev, partsMsg]);
          }
        } else if (message.costUsd !== undefined || message.durationMs !== undefined || (!message.success && message.error)) {
          setMessages((prev) => [...prev, message]);
        }
        currentPartsRef.current = [];
        currentPromptIdRef.current = null;
        setCurrentParts([]);
        break;
      case "error":
        // Finalize any partial parts and add error
        if (currentPartsRef.current.length > 0 && currentPromptIdRef.current) {
          const partsMsg: AssistantPartsMessage = {
            type: "assistant_parts",
            promptId: currentPromptIdRef.current,
            parts: currentPartsRef.current,
            isComplete: false,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, partsMsg, message]);
        } else {
          setMessages((prev) => [...prev, message]);
        }
        currentPartsRef.current = [];
        currentPromptIdRef.current = null;
        setCurrentParts([]);
        break;
      case "status":
        // Status is handled by the status indicator
        break;
      case "session_cleared":
        // Clear all messages for new session
        setMessages([]);
        currentPartsRef.current = [];
        currentPromptIdRef.current = null;
        partIdCounter.current = 0;
        setCurrentParts([]);
        break;
      case "stopped":
        // Preserve partial work when stopped
        if (currentPartsRef.current.length > 0 && currentPromptIdRef.current) {
          finalizeCurrentParts(currentPromptIdRef.current, false);
        } else {
          currentPartsRef.current = [];
          currentPromptIdRef.current = null;
          setCurrentParts([]);
        }
        break;
      case "history":
        // Convert history entries to displayable messages
        const historyMessages: ServerMessage[] = message.entries.flatMap((entry: AnyConversationEntry): ServerMessage[] => {
          if (entry.role === "user") {
            return [{
              type: "user_prompt" as const,
              content: entry.content,
              timestamp: entry.timestamp,
            }];
          } else if (entry.role === "assistant") {
            return [{
              type: "history_result" as const,
              content: entry.content,
              timestamp: entry.timestamp,
            }];
          } else if (entry.role === "tool") {
            // Reconstruct tool message from persisted entry
            return [{
              type: "tool" as const,
              promptId: "",
              toolName: entry.toolName,
              status: entry.status,
              input: entry.input,
              output: entry.output,
              timestamp: entry.timestamp,
            }];
          } else if (entry.role === "system") {
            // Reconstruct system message (errors, stopped, etc.) from persisted entry
            return [{
              type: "system_message" as const,
              messageType: entry.type,
              content: entry.content,
              timestamp: entry.timestamp,
            }];
          }
          return [];
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
      case "branches_list":
        setBranches(message.branches);
        break;
      case "branch_switched":
        if (message.success) {
          setShowBranchSwitcher(false);
          setBranchError(null);
        } else if (message.error) {
          setBranchError(message.error);
        }
        break;
      case "branch_created":
        if (message.success) {
          setShowBranchSwitcher(false);
          setBranchError(null);
        } else if (message.error) {
          setBranchError(message.error);
        }
        break;
    }
  }, [finalizeCurrentParts]);

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
    // Reset current response state
    currentPartsRef.current = [];
    currentPromptIdRef.current = null;
    setCurrentParts([]);

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

  const handleBranchPress = useCallback(() => {
    setShowBranchSwitcher((prev) => !prev);
    // Fetch branches when opening (side-effect outside state updater)
    if (!showBranchSwitcher) {
      const client = getWebSocketClient();
      if (client) {
        client.requestBranches();
      }
    }
  }, [showBranchSwitcher]);

  const handleBranchSelect = useCallback((name: string) => {
    setBranchError(null);
    const client = getWebSocketClient();
    if (client) {
      client.requestSwitchBranch(name);
    }
  }, []);

  const handleBranchCreate = useCallback((name: string) => {
    setBranchError(null);
    const client = getWebSocketClient();
    if (client) {
      client.requestCreateBranch(name);
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
        onBranchPress={handleBranchPress}
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
          <ResponseArea messages={messages} currentParts={currentParts} />
        ) : (
          <GitChangesTab changes={gitChanges} onDiscard={handleDiscard} />
        )}
      </View>
      {activeTab === "chat" && (
        <PromptInput
          ref={promptInputRef}
          onSubmit={handleSubmit}
          onStop={handleStop}
          disabled={status === "disconnected"}
          isProcessing={status === "processing"}
        />
      )}
      {showBranchSwitcher && (
        <BranchSwitcher
          branches={branches}
          currentBranch={branchName}
          onSelect={handleBranchSelect}
          onCreate={handleBranchCreate}
          onClose={() => { setShowBranchSwitcher(false); setBranchError(null); }}
          error={branchError}
        />
      )}
    </View>
  );
}

interface HeaderProps {
  status: ConnectionStatus;
  branchName: string;
  onBranchPress: () => void;
}

function Header({ status, branchName, onBranchPress }: HeaderProps) {
  const statusColors = {
    disconnected: COLORS.STATUS_ERROR,
    connecting: COLORS.STATUS_INFO,
    connected: COLORS.STATUS_SUCCESS,
    processing: COLORS.STATUS_INFO,
  };

  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={handleCollapse} style={styles.closeButton}>
        <Text style={styles.closeButtonText}>✕</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.branchButton} onPress={onBranchPress}>
        <Text style={styles.branchName} numberOfLines={1}>
          {branchName}
        </Text>
        <Text style={styles.branchChevron}>▾</Text>
      </TouchableOpacity>

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

function PulsingIndicator({ status }: { status: ConnectionStatus }) {
  const colors = {
    disconnected: COLORS.STATUS_ERROR,
    connecting: COLORS.STATUS_INFO,
    connected: COLORS.STATUS_SUCCESS,
    processing: COLORS.STATUS_INFO,
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
  // Expanded panel - fills native container (which handles width/centering)
  expanded: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: LAYOUT.BORDER_RADIUS_LG,
    overflow: "hidden",
  },
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
  statusDot: {
    width: SIZES.STATUS_DOT,
    height: SIZES.STATUS_DOT,
    borderRadius: SIZES.STATUS_DOT / 2,
    marginLeft: SPACING.MD, // Match the closeButton marginRight for visual balance
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
  body: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND_ELEVATED,
  },
});
