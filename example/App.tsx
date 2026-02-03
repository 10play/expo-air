import ExpoAir from "@10play/expo-air";
import { useEffect, useRef, useState } from "react";
import { Button, SafeAreaView, ScrollView, Text, View } from "react-native";

export default function App() {
  const [events, setEvents] = useState<string[]>([]);
  const addEventRef = useRef((name: string, data?: Record<string, unknown>) => {
    const entry = data ? `${name}: ${JSON.stringify(data)}` : name;
    setEvents((prev) => [entry, ...prev].slice(0, 10));
  });

  useEffect(() => {
    const s1 = ExpoAir.addListener("onPress", () =>
      addEventRef.current("onPress"),
    );
    const s2 = ExpoAir.addListener("onExpand", () =>
      addEventRef.current("onExpand"),
    );
    const s3 = ExpoAir.addListener("onCollapse", () =>
      addEventRef.current("onCollapse"),
    );
    const s4 = ExpoAir.addListener("onDragEnd", (params) =>
      addEventRef.current("onDragEnd", params),
    );
    return () => {
      s1.remove();
      s2.remove();
      s3.remove();
      s4.remove();
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.container}>
        <Text style={styles.header}>12333</Text>
        <Group name="Floating Bubble">
          <View style={styles.buttonRow}>
            <Button
              title="Show"
              onPress={() => ExpoAir.show({ size: 60, color: "#007AFF" })}
            />
            <Button title="Hide" onPress={() => ExpoAir.hide()} />
          </View>
          <View style={styles.buttonRow}>
            <Button title="Expand" onPress={() => ExpoAir.expand()} />
            <Button title="Collapse" onPress={() => ExpoAir.collapse()} />
          </View>
          {events.length > 0 && (
            <View style={styles.eventLog}>
              <Text style={styles.eventLogTitle}>Events:</Text>
              {events.map((e, i) => (
                <Text key={i} style={styles.eventEntry}>
                  {e}
                </Text>
              ))}
            </View>
          )}
        </Group>
      </ScrollView>
    </SafeAreaView>
  );
}

function Group(props: { name: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupHeader}>{props.name}</Text>
      {props.children}
    </View>
  );
}

const styles = {
  header: {
    fontSize: 30,
    margin: 20,
  },
  groupHeader: {
    fontSize: 20,
    marginBottom: 20,
  },
  group: {
    margin: 20,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 20,
  },
  container: {
    flex: 1,
    backgroundColor: "#eee",
  },
  view: {
    flex: 1,
    height: 200,
  },
  webview: {
    height: 300,
    borderRadius: 8,
  },
  buttonRow: {
    flexDirection: "row" as const,
    gap: 12,
    marginBottom: 8,
  },
  eventLog: {
    marginTop: 12,
    padding: 8,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
  },
  eventLogTitle: {
    fontWeight: "600" as const,
    marginBottom: 4,
  },
  eventEntry: {
    fontSize: 12,
    color: "#555",
    marginBottom: 2,
  },
};
