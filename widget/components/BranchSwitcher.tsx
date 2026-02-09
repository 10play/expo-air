import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Animated,
  Easing,
} from "react-native";
import type { BranchInfo } from "../services/websocket";
import { SPACING, LAYOUT, COLORS, TYPOGRAPHY } from "../constants/design";

// Header height: paddingVertical (14) * 2 + content (~20) + border (1) ≈ 49
const HEADER_HEIGHT = 49;
const DEFAULT_BRANCHES = ["main", "master"];
const RECENT_COUNT = 5;

interface BranchSwitcherProps {
  branches: BranchInfo[];
  currentBranch: string;
  loading?: boolean;
  onSelect: (branchName: string) => void;
  onCreate: (branchName: string) => void;
  onClose: () => void;
  error?: string | null;
}

interface BranchSection {
  title: string;
  branches: BranchInfo[];
}

function groupBranches(
  branches: BranchInfo[],
  searchQuery: string
): BranchSection[] {
  const query = searchQuery.toLowerCase().trim();
  const filtered = query
    ? branches.filter((b) => b.name.toLowerCase().includes(query))
    : branches;

  const defaultBranch = filtered.filter((b) =>
    DEFAULT_BRANCHES.includes(b.name)
  );
  const remaining = filtered.filter(
    (b) => !DEFAULT_BRANCHES.includes(b.name)
  );

  // Recent: local non-default branches, top N by commit date (already sorted)
  const recentLocal = remaining.filter((b) => !b.isRemote);
  const recent = recentLocal.slice(0, RECENT_COUNT);
  const recentNames = new Set(recent.map((b) => b.name));

  // Other: everything else
  const other = remaining.filter((b) => !recentNames.has(b.name));

  const sections: BranchSection[] = [];
  if (defaultBranch.length > 0)
    sections.push({ title: "Default", branches: defaultBranch });
  if (recent.length > 0)
    sections.push({ title: "Recent", branches: recent });
  if (other.length > 0)
    sections.push({ title: "Other", branches: other });

  return sections;
}

export function BranchSwitcher({
  branches,
  currentBranch,
  loading,
  onSelect,
  onCreate,
  onClose,
  error,
}: BranchSwitcherProps) {
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");

  const sections = groupBranches(branches, "");

  const handleCreate = () => {
    const trimmed = newBranchName.trim();
    if (trimmed) {
      onCreate(trimmed);
      setNewBranchName("");
      setShowCreateInput(false);
    }
  };

  const renderBranchItem = (branch: BranchInfo, isFirst: boolean) => {
    const isCurrent = branch.name === currentBranch;
    return (
      <TouchableOpacity
        key={branch.name}
        style={[
          styles.branchItem,
          isCurrent && styles.branchItemCurrent,
          isFirst && styles.branchItemFirst,
        ]}
        onPress={() => {
          if (!isCurrent) {
            onSelect(branch.name);
          }
        }}
        activeOpacity={isCurrent ? 1 : 0.6}
      >
        <View style={styles.branchInfo}>
          <Text
            style={[
              styles.branchName,
              isCurrent && styles.branchNameCurrent,
            ]}
            numberOfLines={1}
          >
            {branch.name}
          </Text>
          {branch.prNumber && (
            <View style={styles.prBadge}>
              <Text style={styles.prBadgeText}>#{branch.prNumber}</Text>
            </View>
          )}
          {branch.isRemote && (
            <View style={styles.remoteBadge}>
              <Text style={styles.remoteBadgeText}>remote</Text>
            </View>
          )}
        </View>
        {isCurrent && <Text style={styles.currentIndicator}>✓</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.overlay}>
      <TouchableOpacity
        style={styles.backdrop}
        onPress={onClose}
        activeOpacity={1}
      />
      <View style={styles.dropdown}>
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText} numberOfLines={2}>
              {error}
            </Text>
          </View>
        )}
        {loading && branches.length === 0 ? (
          <View style={styles.loadingContainer}>
            <LoadingDots />
          </View>
        ) : (
          <ScrollView style={styles.branchList} bounces={false}>
            {sections.map((section) => (
              <View key={section.title}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionHeaderText}>
                    {section.title}
                  </Text>
                </View>
                {section.branches.map((branch, index) =>
                  renderBranchItem(branch, index === 0)
                )}
              </View>
            ))}
          </ScrollView>
        )}

        <View style={styles.createSection}>
          {showCreateInput ? (
            <View style={styles.createInputRow}>
              <TextInput
                style={styles.createInput}
                value={newBranchName}
                onChangeText={setNewBranchName}
                placeholder="branch-name"
                placeholderTextColor={COLORS.TEXT_MUTED}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleCreate}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[
                  styles.createConfirmButton,
                  !newBranchName.trim() && styles.createConfirmDisabled,
                ]}
                onPress={handleCreate}
                disabled={!newBranchName.trim()}
              >
                <Text style={styles.createConfirmText}>Create</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => setShowCreateInput(true)}
            >
              <Text style={styles.createButtonText}>
                + New branch from main
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

function LoadingDots() {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 300,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.3,
            duration: 300,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 150);
    const a3 = animate(dot3, 300);
    a1.start();
    a2.start();
    a3.start();
    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.loadingDots}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View key={i} style={[styles.loadingDot, { opacity: dot }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  dropdown: {
    position: "absolute",
    top: HEADER_HEIGHT,
    left: SPACING.SM,
    right: SPACING.SM,
    maxHeight: "60%",
    backgroundColor: "#1C1C1E",
    borderRadius: LAYOUT.BORDER_RADIUS_SM,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  loadingContainer: {
    paddingVertical: SPACING.XL,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingDots: {
    flexDirection: "row",
    gap: 6,
  },
  loadingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  branchList: {
    maxHeight: 300,
  },
  sectionHeader: {
    paddingHorizontal: SPACING.LG,
    paddingTop: SPACING.MD,
    paddingBottom: SPACING.XS,
  },
  sectionHeaderText: {
    color: COLORS.TEXT_MUTED,
    fontSize: TYPOGRAPHY.SIZE_XS,
    fontWeight: TYPOGRAPHY.WEIGHT_SEMIBOLD,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  branchItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.LG,
    paddingVertical: SPACING.MD + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  branchItemFirst: {
    paddingTop: SPACING.MD + 2,
  },
  branchItemCurrent: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  branchInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.SM,
  },
  branchName: {
    color: "rgba(255,255,255,0.85)",
    fontSize: TYPOGRAPHY.SIZE_MD,
    fontWeight: TYPOGRAPHY.WEIGHT_NORMAL,
    flexShrink: 1,
  },
  branchNameCurrent: {
    color: COLORS.TEXT_PRIMARY,
    fontWeight: TYPOGRAPHY.WEIGHT_MEDIUM,
  },
  prBadge: {
    backgroundColor: "rgba(0,122,255,0.15)",
    paddingHorizontal: SPACING.SM,
    paddingVertical: 2,
    borderRadius: 8,
  },
  prBadgeText: {
    color: COLORS.STATUS_INFO,
    fontSize: TYPOGRAPHY.SIZE_XS,
    fontWeight: TYPOGRAPHY.WEIGHT_MEDIUM,
  },
  remoteBadge: {
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: SPACING.SM,
    paddingVertical: 2,
    borderRadius: 8,
  },
  remoteBadgeText: {
    color: COLORS.TEXT_MUTED,
    fontSize: TYPOGRAPHY.SIZE_XS,
    fontWeight: TYPOGRAPHY.WEIGHT_NORMAL,
  },
  currentIndicator: {
    color: COLORS.STATUS_SUCCESS,
    fontSize: TYPOGRAPHY.SIZE_SM,
    marginLeft: SPACING.SM,
  },
  createSection: {
    paddingHorizontal: SPACING.LG,
    paddingVertical: SPACING.MD,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  createButton: {
    paddingVertical: SPACING.XS,
  },
  createButtonText: {
    color: COLORS.STATUS_INFO,
    fontSize: TYPOGRAPHY.SIZE_MD,
    fontWeight: TYPOGRAPHY.WEIGHT_MEDIUM,
  },
  createInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.SM,
  },
  createInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    color: COLORS.TEXT_PRIMARY,
    fontSize: TYPOGRAPHY.SIZE_MD,
    paddingHorizontal: SPACING.MD,
    paddingVertical: SPACING.SM,
    borderRadius: 10,
  },
  createConfirmButton: {
    backgroundColor: COLORS.STATUS_INFO,
    paddingHorizontal: SPACING.MD,
    paddingVertical: SPACING.SM,
    borderRadius: 10,
  },
  createConfirmDisabled: {
    opacity: 0.4,
  },
  createConfirmText: {
    color: COLORS.TEXT_PRIMARY,
    fontSize: TYPOGRAPHY.SIZE_SM,
    fontWeight: TYPOGRAPHY.WEIGHT_SEMIBOLD,
  },
  errorBanner: {
    backgroundColor: "rgba(255,59,48,0.15)",
    paddingHorizontal: SPACING.LG,
    paddingVertical: SPACING.SM,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,59,48,0.3)",
  },
  errorText: {
    color: "#FF6B6B",
    fontSize: TYPOGRAPHY.SIZE_SM,
  },
});
