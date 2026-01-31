import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

interface BubbleContentProps {
  size?: number;
  color?: string;
}

export function BubbleContent({
  size = 60,
  color = "#007AFF",
}: BubbleContentProps) {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <TouchableOpacity
        style={[
          styles.collapsed,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
          },
        ]}
        onPress={() => setExpanded(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.collapsedText}>F</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.expanded, { backgroundColor: color }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Expo Flow</Text>
        <TouchableOpacity onPress={() => setExpanded(false)}>
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.body}>
        <Text style={styles.bodyText}>Dev ToolSSs</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  collapsed: {
    alignItems: "center",
    justifyContent: "center",
  },
  collapsedText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
  },
  expanded: {
    width: 250,
    height: 300,
    borderRadius: 16,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  closeButton: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  body: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
    margin: 8,
    borderRadius: 8,
    padding: 12,
  },
  bodyText: {
    color: "#fff",
    fontSize: 14,
  },
});
