import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from "react-native";
import type { BranchInfo } from "../services/websocket";
import { SPACING, LAYOUT, COLORS, TYPOGRAPHY } from "../constants/design";

// Header height: paddingVertical (14) * 2 + content (~20) + border (1) ≈ 49
const HEADER_HEIGHT = 49;

interface BranchSwitcherProps {
  branches: BranchInfo[];
  currentBranch: string;
  onSelect: (branchName: string) => void;
  onCreate: (branchName: string) => void;
  onClose: () => void;
  error?: string | null;
}

export function BranchSwitcher({
  branches,
  currentBranch,
  onSelect,
  onCreate,
  onClose,
  error,
}: BranchSwitcherProps) {
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");

  const handleCreate = () => {
    const trimmed = newBranchName.trim();
    if (trimmed) {
      onCreate(trimmed);
      setNewBranchName("");
      setShowCreateInput(false);
    }
  };

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
      <View style={styles.dropdown}>
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
          </View>
        )}
        <ScrollView style={styles.branchList} bounces={false}>
          {branches.map((branch, index) => (
            <TouchableOpacity
              key={branch.name}
              style={[
                styles.branchItem,
                branch.isCurrent && styles.branchItemCurrent,
                index === 0 && styles.branchItemFirst,
              ]}
              onPress={() => {
                if (!branch.isCurrent) {
                  onSelect(branch.name);
                }
              }}
              activeOpacity={branch.isCurrent ? 1 : 0.6}
            >
              <View style={styles.branchInfo}>
                <Text
                  style={[
                    styles.branchName,
                    branch.isCurrent && styles.branchNameCurrent,
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
              </View>
              {branch.isCurrent && (
                <Text style={styles.currentIndicator}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

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
              <Text style={styles.createButtonText}>+ New branch from main</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
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
  branchList: {
    maxHeight: 300,
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
