import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { GitChange } from "../services/websocket";

interface GitChangesTabProps {
  changes: GitChange[];
  hasPR: boolean;
  onCommit?: () => void;
  onCreatePR?: () => void;
}

export function GitChangesTab({ changes, hasPR, onCommit, onCreatePR }: GitChangesTabProps) {
  const hasChanges = changes.length > 0;

  // Determine which action to show:
  // - No PR exists → "Create PR"
  // - PR exists + uncommitted changes → "Commit"
  // - PR exists + no changes → show nothing actionable
  const showCommit = hasPR && hasChanges;
  const showCreatePR = !hasPR;

  if (!showCommit && !showCreatePR) {
    return (
      <View style={styles.container}>
        <Text style={styles.readyText}>✓ Ready</Text>
        <Text style={styles.subtext}>PR exists, no uncommitted changes</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {showCommit ? (
        <>
          <Text style={styles.countText}>{changes.length} change{changes.length !== 1 ? "s" : ""}</Text>
          <TouchableOpacity style={styles.commitButton} onPress={onCommit}>
            <Text style={styles.buttonText}>Commit</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          {hasChanges && (
            <Text style={styles.countText}>{changes.length} uncommitted change{changes.length !== 1 ? "s" : ""}</Text>
          )}
          <TouchableOpacity style={styles.prButton} onPress={onCreatePR}>
            <Text style={styles.buttonText}>Create PR</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  countText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 15,
    marginBottom: 16,
  },
  readyText: {
    color: "#30D158",
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 8,
  },
  subtext: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 14,
  },
  commitButton: {
    backgroundColor: "#30D158",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 48,
    minWidth: 200,
    alignItems: "center",
  },
  prButton: {
    backgroundColor: "#007AFF",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 48,
    minWidth: 200,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
});
