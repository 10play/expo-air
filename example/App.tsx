import "@10play/expo-air/build/hmrReconnect";
import ExpoAir from "@10play/expo-air";
import { useEffect } from "react";
import { StatusBar, StyleSheet, View } from "react-native";
import { GTA2Game } from "./game";

export default function App() {
  useEffect(() => {
    ExpoAir.show({ size: 60, color: "#007AFF" });
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <GTA2Game />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
});
