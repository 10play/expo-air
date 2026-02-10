import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, StyleSheet, NativeModules, NativeEventEmitter, Platform, TouchableOpacity } from "react-native";

import { PromptInput, type PromptInputHandle } from "./components/PromptInput";
import { ResponseArea } from "./components/ResponseArea";
import { GitChangesTab } from "./components/GitChangesTab";
import { BranchSwitcher } from "./components/BranchSwitcher";
import { Header, PulsingIndicator } from "./components/Header";
import { TabBar, type TabType } from "./components/TabBar";
import { useWebSocketMessages } from "./hooks/useWebSocketMessages";
import { useGitState } from "./hooks/useGitState";
import type { ServerMessage } from "./services/websocket";
import { LAYOUT, COLORS, SPACING, TYPOGRAPHY } from "./constants/design";

const { WidgetBridge } = NativeModules;

interface BubbleContentProps {
  size?: number;
  color?: string;
  expanded?: boolean;
  serverUrl?: string;
}

export function BubbleContent({
  size = 60,
  color = "#000000",  // Black to match Dynamic Island
  expanded: initialExpanded = false,
  serverUrl = "ws://localhost:3847",
}: BubbleContentProps) {
  const [activeTab, setActiveTab] = useState<TabType>("chat");
  const promptInputRef = useRef<PromptInputHandle>(null);

  // On Android, expanded state is driven by native events (WidgetBridge emits onExpandCollapse).
  // On iOS, it comes as a prop update from the native surface.
  const [expanded, setExpanded] = useState(initialExpanded);

  // Listen for native expand/collapse events (Android)
  useEffect(() => {
    if (Platform.OS !== "android" || !WidgetBridge) return;
    const emitter = new NativeEventEmitter(WidgetBridge);
    const subscription = emitter.addListener("onExpandCollapse", (event: { expanded: boolean }) => {
      setExpanded(event.expanded);
    });
    return () => subscription.remove();
  }, []);

  // Sync with prop changes (iOS)
  useEffect(() => {
    setExpanded(initialExpanded);
  }, [initialExpanded]);

  // Use a ref to break the circular dependency between the two hooks:
  // useWebSocketMessages needs onGitMessage from useGitState
  // useGitState needs handleSubmit from useWebSocketMessages
  const gitMessageHandlerRef = useRef<(msg: ServerMessage) => void>(() => {});
  const onGitMessage = useCallback((msg: ServerMessage) => {
    gitMessageHandlerRef.current(msg);
  }, []);

  const {
    status,
    messages,
    currentParts,
    handleSubmit,
    handleNewSession,
    handleStop,
  } = useWebSocketMessages({
    serverUrl,
    onGitMessage,
  });

  const git = useGitState({ handleSubmit, setActiveTab });

  // Keep the ref in sync — WebSocket connects asynchronously so this
  // will be set before any git messages arrive
  gitMessageHandlerRef.current = git.handleGitMessage;

  // Auto-focus input when widget expands
  useEffect(() => {
    if (expanded && activeTab === "chat") {
      // Small delay to ensure the component is mounted
      setTimeout(() => promptInputRef.current?.focus(), 100);
    }
  }, [expanded]);

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
    <View style={[styles.expanded, { backgroundColor: color }]}>
      <Header
        status={status}
        branchName={git.branchName}
        onBranchPress={git.handleBranchPress}
      />
      <TabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onNewSession={handleNewSession}
        canStartNew={status === "connected"}
        hasPR={git.hasPR}
        hasChanges={git.gitChanges.length > 0}
        prNumber={git.prNumber}
        onCreatePR={git.handleCreatePR}
        onCommit={git.handleCommit}
        onViewPR={git.handleViewPR}
      />
      <View style={styles.body}>
        {status === "disconnected" && messages.length === 0 ? (
          <DisconnectedView />
        ) : activeTab === "chat" ? (
          <ResponseArea messages={messages} currentParts={currentParts} status={status} />
        ) : (
          <GitChangesTab changes={git.gitChanges} onDiscard={git.handleDiscard} />
        )}
      </View>
      {activeTab === "chat" && status !== "disconnected" && (
        <PromptInput
          ref={promptInputRef}
          onSubmit={handleSubmit}
          onStop={handleStop}
          disabled={status === "disconnected"}
          isSending={status === "sending"}
          isProcessing={status === "processing"}
        />
      )}
      {git.showBranchSwitcher && (
        <BranchSwitcher
          branches={git.branches}
          currentBranch={git.branchName}
          onSelect={git.handleBranchSelect}
          onCreate={git.handleBranchCreate}
          onClose={() => { git.setShowBranchSwitcher(false); git.setBranchError(null); }}
          error={git.branchError}
        />
      )}
    </View>
  );
}

function DisconnectedView() {
  return (
    <View style={styles.disconnectedContainer}>
      <Text style={styles.disconnectedTitle}>Server not running</Text>
      <Text style={styles.disconnectedSubtitle}>
        Start the development server from your project directory:
      </Text>
      <View style={styles.codeBlock}>
        <Text style={styles.codeText}>npx expo-air fly</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  collapsedPill: {
    width: 100,
    height: 32,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  expanded: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: LAYOUT.BORDER_RADIUS_LG,
    overflow: "hidden",
  },
  body: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND_ELEVATED,
  },
  disconnectedContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: SPACING.XXL,
  },
  disconnectedTitle: {
    color: COLORS.TEXT_MUTED,
    fontSize: TYPOGRAPHY.SIZE_LG,
    fontWeight: TYPOGRAPHY.WEIGHT_SEMIBOLD,
    marginBottom: SPACING.SM,
  },
  disconnectedSubtitle: {
    color: COLORS.TEXT_MUTED,
    fontSize: TYPOGRAPHY.SIZE_SM,
    textAlign: "center",
    marginBottom: SPACING.LG,
  },
  codeBlock: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: LAYOUT.BORDER_RADIUS_SM,
    paddingHorizontal: SPACING.LG,
    paddingVertical: SPACING.MD,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
  },
  codeText: {
    color: COLORS.TEXT_SECONDARY,
    fontSize: TYPOGRAPHY.SIZE_SM,
    fontFamily: "Menlo",
  },
});
