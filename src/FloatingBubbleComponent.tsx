import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type BubbleProps = {
  size?: number;
  color?: string;
  expanded?: boolean;
};

export default function BubbleContent({
  size = 60,
  color = '#007AFF',
  expanded = false,
}: BubbleProps) {
  if (expanded) {
    return (
      <View style={[styles.expandedContainer, { backgroundColor: color }]}>
        <View style={styles.expandedHeader}>
          <View style={[styles.dot, { backgroundColor: 'rgba(255,255,255,0.5)' }]} />
          <Text style={styles.headerText}>Expo Flow</Text>
        </View>
        <View style={styles.expandedBody}>
          <Text style={styles.bodyText}>Floating bubble panel</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.collapsedContainer,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
      ]}
    >
      <Text style={styles.collapsedText}>F</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  collapsedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsedText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  expandedContainer: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  headerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  expandedBody: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    margin: 8,
    marginTop: 0,
    borderRadius: 10,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bodyText: {
    color: '#fff',
    fontSize: 14,
  },
});
