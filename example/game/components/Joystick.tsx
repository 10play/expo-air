import { useRef, useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import { GameState } from "../types";

// Joystick dimensions
const BASE_SIZE = 120;
const KNOB_SIZE = 50;
const MAX_DISTANCE = (BASE_SIZE - KNOB_SIZE) / 2;

type JoystickProps = {
  gameState: GameState;
};

export function Joystick({ gameState }: JoystickProps) {
  const [knobX, setKnobX] = useState(0);
  const [knobY, setKnobY] = useState(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {},
      onPanResponderMove: (_, gestureState) => {
        const distance = Math.sqrt(
          gestureState.dx * gestureState.dx + gestureState.dy * gestureState.dy
        );
        const angle = Math.atan2(gestureState.dy, gestureState.dx);
        const clampedDistance = Math.min(distance, MAX_DISTANCE);

        setKnobX(Math.cos(angle) * clampedDistance);
        setKnobY(Math.sin(angle) * clampedDistance);

        if (distance > 10) {
          gameState.ja = angle;
          gameState.jm = clampedDistance / MAX_DISTANCE;
        } else {
          gameState.jm = 0;
        }
      },
      onPanResponderRelease: () => {
        setKnobX(0);
        setKnobY(0);
        gameState.jm = 0;
      },
      onPanResponderTerminate: () => {
        setKnobX(0);
        setKnobY(0);
        gameState.jm = 0;
      },
    })
  ).current;

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View style={styles.container} {...panResponder.panHandlers}>
        <View style={styles.base}>
          <View
            style={[
              styles.knob,
              { transform: [{ translateX: knobX }, { translateY: knobY }] },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    bottom: 40,
    left: 20,
    zIndex: 10,
  },
  container: {
    width: BASE_SIZE,
    height: BASE_SIZE,
    justifyContent: "center",
    alignItems: "center",
  },
  base: {
    width: BASE_SIZE,
    height: BASE_SIZE,
    borderRadius: BASE_SIZE / 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  knob: {
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
    backgroundColor: "rgba(255,255,255,0.5)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.7)",
  },
});
