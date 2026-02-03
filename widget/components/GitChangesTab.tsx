import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import type { GitChange } from "../services/websocket";

interface GitChangesTabProps {
  changes: GitChange[];
  onDiscard?: () => void;
}

export function GitChangesTab({ changes, onDiscard }: GitChangesTabProps) {
  const hasChanges = changes.length > 0;

  return (
    <View style={styles.container}>
      {hasChanges ? (
        <>
          <ScrollView style={styles.fileList} contentContainerStyle={styles.fileListContent}>
            {changes.map((change, index) => (
              <View key={index} style={styles.fileItem}>
                <Text style={[styles.fileStatus, styles[`status_${change.status}`]]}>
                  {getStatusIcon(change.status)}
                </Text>
                <Text style={styles.fileName} numberOfLines={1}>
                  {change.file}
                </Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.footer}>
            <TouchableOpacity style={styles.discardButton} onPress={onDiscard}>
              <Text style={styles.discardButtonText}>Discard All Changes</Text>
            </TouchableOpacity>
            <Text style={styles.warningText}>
              Note: Discarding changes won't reset Claude's memory
            </Text>
          </View>
        </>
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No uncommitted changes</Text>
          <Text style={styles.emptySubtext}>Your working directory is clean</Text>
        </View>
      )}
    </View>
  );
}

function getStatusIcon(status: GitChange["status"]): string {
  switch (status) {
    case "added":
      return "+";
    case "modified":
      return "M";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "untracked":
      return "?";
    default:
      return "•";
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  fileList: {
    flex: 1,
  },
  fileListContent: {
    padding: 16,
  },
  fileItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  fileStatus: {
    width: 24,
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "monospace",
  },
  status_added: {
    color: "#30D158",
  },
  status_modified: {
    color: "#FF9F0A",
  },
  status_deleted: {
    color: "#FF453A",
  },
  status_renamed: {
    color: "#5E5CE6",
  },
  status_untracked: {
    color: "rgba(255,255,255,0.5)",
  },
  fileName: {
    flex: 1,
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    fontFamily: "monospace",
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  discardButton: {
    backgroundColor: "rgba(255,69,58,0.15)",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  discardButtonText: {
    color: "#FF453A",
    fontSize: 15,
    fontWeight: "600",
  },
  warningText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    textAlign: "center",
    marginTop: 10,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 16,
    fontWeight: "500",
  },
  emptySubtext: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 14,
    marginTop: 6,
  },
});
