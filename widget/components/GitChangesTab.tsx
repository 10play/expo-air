import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import type { GitChange } from "../services/websocket";

interface GitChangesTabProps {
  changes: GitChange[];
  onDiscard?: () => void;
}

const STATUS_ICONS: Record<GitChange["status"], string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  untracked: "?",
};

const STATUS_COLORS: Record<GitChange["status"], string> = {
  added: "#30D158",
  modified: "#FFD60A",
  deleted: "#FF453A",
  renamed: "#BF5AF2",
  untracked: "#8E8E93",
};

export function GitChangesTab({ changes, onDiscard }: GitChangesTabProps) {
  const hasChanges = changes.length > 0;

  if (!hasChanges) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No uncommitted changes</Text>
        <Text style={styles.emptySubtext}>Your working directory is clean</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.fileList} contentContainerStyle={styles.fileListContent}>
        {changes.map((change, index) => (
          <View key={`${change.file}-${index}`} style={styles.fileRow}>
            <Text style={[styles.statusIcon, { color: STATUS_COLORS[change.status] }]}>
              {STATUS_ICONS[change.status]}
            </Text>
            <Text style={styles.fileName} numberOfLines={1}>
              {change.file}
            </Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <TouchableOpacity style={styles.discardButton} onPress={onDiscard}>
          <Text style={styles.discardText}>Discard All Changes</Text>
        </TouchableOpacity>
        <Text style={styles.warningText}>Note: Discarding won't reset memory</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyTitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 8,
  },
  emptySubtext: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 14,
  },
  fileList: {
    flex: 1,
  },
  fileListContent: {
    padding: 16,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  statusIcon: {
    width: 20,
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Menlo",
  },
  fileName: {
    flex: 1,
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    fontFamily: "Menlo",
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
  },
  discardButton: {
    backgroundColor: "rgba(255,59,48,0.15)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  discardText: {
    color: "#FF3B30",
    fontSize: 15,
    fontWeight: "500",
  },
  warningText: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 12,
  },
});
