import "@10play/expo-air/build/hmrReconnect";
import ExpoAir from "@10play/expo-air";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Button,
  Dimensions,
  Easing,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Game constants
const GAME_WIDTH = SCREEN_WIDTH - 40;
const GROUND_HEIGHT = 30;
const CAR_WIDTH = 60;
const CAR_HEIGHT = 40;
const OBSTACLE_WIDTH = 25;
const OBSTACLE_HEIGHT = 35;
const JUMP_HEIGHT = 100; // Higher jump for easier clearing
const JUMP_DURATION = 500; // Longer jump for more hang time

// Game Tiger - chases car when game is over
function GameTiger({
  isChasing,
  onCaught,
  carPosition,
}: {
  isChasing: boolean;
  onCaught: () => void;
  carPosition: number;
}) {
  const translateX = useRef(new Animated.Value(-80)).current;
  const legAnimation = useRef(new Animated.Value(0)).current;
  const bounceY = useRef(new Animated.Value(0)).current;
  const mouthOpen = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isChasing) {
      // Tiger runs towards the car
      Animated.timing(translateX, {
        toValue: carPosition - 20,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(() => {
        // Open mouth to eat
        Animated.timing(mouthOpen, {
          toValue: 1,
          duration: 200,
          useNativeDriver: false,
        }).start(() => {
          onCaught();
        });
      });

      // Running leg animation
      const runAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(legAnimation, {
            toValue: 1,
            duration: 80,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(legAnimation, {
            toValue: 0,
            duration: 80,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ]),
      );

      // Bounce while running
      const bounceAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(bounceY, {
            toValue: -5,
            duration: 80,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(bounceY, {
            toValue: 0,
            duration: 80,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );

      runAnimation.start();
      bounceAnimation.start();

      return () => {
        runAnimation.stop();
        bounceAnimation.stop();
      };
    } else {
      // Reset position when not chasing
      translateX.setValue(-80);
      mouthOpen.setValue(0);
    }
  }, [
    isChasing,
    carPosition,
    translateX,
    legAnimation,
    bounceY,
    mouthOpen,
    onCaught,
  ]);

  const frontLegRotate = legAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ["-30deg", "30deg"],
  });

  const backLegRotate = legAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ["30deg", "-30deg"],
  });

  const px = 3;

  if (!isChasing) return null;

  return (
    <Animated.View
      style={[
        gameTigerStyles.tigerContainer,
        {
          transform: [{ translateX }, { translateY: bounceY }],
        },
      ]}
    >
      {/* Tiger body */}
      <View
        style={[
          gameTigerStyles.pixel,
          {
            width: px * 10,
            height: px * 5,
            backgroundColor: "#FFA500",
            left: px * 2,
            top: px * 2,
          },
        ]}
      />

      {/* Tiger stripes */}
      <View
        style={[
          gameTigerStyles.pixel,
          {
            width: px * 1,
            height: px * 4,
            backgroundColor: "#222",
            left: px * 4,
            top: px * 2,
          },
        ]}
      />
      <View
        style={[
          gameTigerStyles.pixel,
          {
            width: px * 1,
            height: px * 4,
            backgroundColor: "#222",
            left: px * 7,
            top: px * 2,
          },
        ]}
      />
      <View
        style={[
          gameTigerStyles.pixel,
          {
            width: px * 1,
            height: px * 4,
            backgroundColor: "#222",
            left: px * 10,
            top: px * 2,
          },
        ]}
      />

      {/* Tiger head */}
      <View
        style={[
          gameTigerStyles.pixel,
          {
            width: px * 5,
            height: px * 5,
            backgroundColor: "#FFA500",
            left: px * 12,
            top: px * 1,
          },
        ]}
      />

      {/* Ears */}
      <View
        style={[
          gameTigerStyles.pixel,
          {
            width: px * 2,
            height: px * 2,
            backgroundColor: "#FFA500",
            left: px * 12,
            top: -px * 1,
          },
        ]}
      />
      <View
        style={[
          gameTigerStyles.pixel,
          {
            width: px * 2,
            height: px * 2,
            backgroundColor: "#FFA500",
            left: px * 15,
            top: -px * 1,
          },
        ]}
      />

      {/* Eyes - angry */}
      <View
        style={[
          gameTigerStyles.pixel,
          {
            width: px * 1,
            height: px * 2,
            backgroundColor: "#FF0000",
            left: px * 13,
            top: px * 2,
          },
        ]}
      />
      <View
        style={[
          gameTigerStyles.pixel,
          {
            width: px * 1,
            height: px * 2,
            backgroundColor: "#FF0000",
            left: px * 15,
            top: px * 2,
          },
        ]}
      />

      {/* Mouth/Teeth */}
      <View
        style={[
          gameTigerStyles.pixel,
          {
            width: px * 3,
            height: px * 2,
            backgroundColor: "#FF6B6B",
            left: px * 13,
            top: px * 4,
          },
        ]}
      />
      <View
        style={[
          gameTigerStyles.pixel,
          {
            width: px * 1,
            height: px * 1,
            backgroundColor: "#FFF",
            left: px * 13,
            top: px * 4,
          },
        ]}
      />
      <View
        style={[
          gameTigerStyles.pixel,
          {
            width: px * 1,
            height: px * 1,
            backgroundColor: "#FFF",
            left: px * 15,
            top: px * 4,
          },
        ]}
      />

      {/* Tail */}
      <View
        style={[
          gameTigerStyles.pixel,
          {
            width: px * 4,
            height: px * 2,
            backgroundColor: "#FFA500",
            left: -px * 2,
            top: px * 2,
          },
        ]}
      />
      <View
        style={[
          gameTigerStyles.pixel,
          {
            width: px * 1,
            height: px * 2,
            backgroundColor: "#222",
            left: -px * 2,
            top: px * 2,
          },
        ]}
      />

      {/* Front legs */}
      <Animated.View
        style={[
          gameTigerStyles.leg,
          {
            left: px * 10,
            top: px * 6,
            transformOrigin: "top",
            transform: [{ rotate: frontLegRotate }],
          },
        ]}
      />
      <Animated.View
        style={[
          gameTigerStyles.leg,
          {
            left: px * 11,
            top: px * 6,
            transformOrigin: "top",
            transform: [{ rotate: backLegRotate }],
          },
        ]}
      />

      {/* Back legs */}
      <Animated.View
        style={[
          gameTigerStyles.leg,
          {
            left: px * 3,
            top: px * 6,
            transformOrigin: "top",
            transform: [{ rotate: backLegRotate }],
          },
        ]}
      />
      <Animated.View
        style={[
          gameTigerStyles.leg,
          {
            left: px * 4,
            top: px * 6,
            transformOrigin: "top",
            transform: [{ rotate: frontLegRotate }],
          },
        ]}
      />
    </Animated.View>
  );
}

const gameTigerStyles = StyleSheet.create({
  tigerContainer: {
    position: "absolute",
    bottom: GROUND_HEIGHT - 5,
    width: 60,
    height: 35,
  },
  pixel: {
    position: "absolute",
  },
  leg: {
    position: "absolute",
    width: 5,
    height: 12,
    backgroundColor: "#FFA500",
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
});

// Game Car component
function GameCar({
  jumpY,
  isEaten,
}: {
  jumpY: Animated.Value;
  isEaten: boolean;
}) {
  const wheelRotation = useRef(new Animated.Value(0)).current;
  const scaleX = useRef(new Animated.Value(1)).current;
  const scaleY = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Wheel spinning animation
    const wheelAnimation = Animated.loop(
      Animated.timing(wheelRotation, {
        toValue: 1,
        duration: 300,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    wheelAnimation.start();
    return () => wheelAnimation.stop();
  }, [wheelRotation]);

  useEffect(() => {
    if (isEaten) {
      // Squish animation when eaten
      Animated.parallel([
        Animated.timing(scaleX, {
          toValue: 1.5,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(scaleY, {
          toValue: 0.3,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleX.setValue(1);
      scaleY.setValue(1);
    }
  }, [isEaten, scaleX, scaleY]);

  const wheelSpin = wheelRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const px = 4;

  return (
    <Animated.View
      style={[
        gameCarStyles.carContainer,
        {
          transform: [
            { translateY: Animated.multiply(jumpY, -1) },
            { scaleX },
            { scaleY },
          ],
        },
      ]}
    >
      {/* Car body - Main structure using pixel blocks */}
      {/* Top/Roof */}
      <View
        style={[
          gameCarStyles.pixel,
          {
            width: px * 6,
            height: px * 3,
            backgroundColor: "#FF4444",
            left: px * 4,
            top: 0,
          },
        ]}
      />

      {/* Windows */}
      <View
        style={[
          gameCarStyles.pixel,
          {
            width: px * 2,
            height: px * 2,
            backgroundColor: "#87CEEB",
            left: px * 5,
            top: px * 0.5,
          },
        ]}
      />
      <View
        style={[
          gameCarStyles.pixel,
          {
            width: px * 2,
            height: px * 2,
            backgroundColor: "#87CEEB",
            left: px * 8,
            top: px * 0.5,
          },
        ]}
      />

      {/* Main body */}
      <View
        style={[
          gameCarStyles.pixel,
          {
            width: px * 14,
            height: px * 4,
            backgroundColor: "#FF4444",
            left: 0,
            top: px * 3,
          },
        ]}
      />

      {/* Hood highlight */}
      <View
        style={[
          gameCarStyles.pixel,
          {
            width: px * 4,
            height: px * 1,
            backgroundColor: "#FF6666",
            left: px * 10,
            top: px * 3,
          },
        ]}
      />

      {/* Headlight */}
      <View
        style={[
          gameCarStyles.pixel,
          {
            width: px * 1,
            height: px * 2,
            backgroundColor: "#FFFF00",
            left: px * 13,
            top: px * 4,
          },
        ]}
      />

      {/* Taillight */}
      <View
        style={[
          gameCarStyles.pixel,
          {
            width: px * 1,
            height: px * 2,
            backgroundColor: "#FF0000",
            left: 0,
            top: px * 4,
          },
        ]}
      />

      {/* Bumpers */}
      <View
        style={[
          gameCarStyles.pixel,
          {
            width: px * 2,
            height: px * 1,
            backgroundColor: "#333",
            left: px * 12,
            top: px * 6,
          },
        ]}
      />
      <View
        style={[
          gameCarStyles.pixel,
          {
            width: px * 2,
            height: px * 1,
            backgroundColor: "#333",
            left: 0,
            top: px * 6,
          },
        ]}
      />

      {/* Front wheel */}
      <Animated.View
        style={[
          gameCarStyles.wheel,
          {
            left: px * 9,
            top: px * 6,
            transform: [{ rotate: wheelSpin }],
          },
        ]}
      >
        <View style={gameCarStyles.wheelInner} />
        <View
          style={[
            gameCarStyles.wheelSpoke,
            { transform: [{ rotate: "0deg" }] },
          ]}
        />
        <View
          style={[
            gameCarStyles.wheelSpoke,
            { transform: [{ rotate: "90deg" }] },
          ]}
        />
      </Animated.View>

      {/* Rear wheel */}
      <Animated.View
        style={[
          gameCarStyles.wheel,
          {
            left: px * 2,
            top: px * 6,
            transform: [{ rotate: wheelSpin }],
          },
        ]}
      >
        <View style={gameCarStyles.wheelInner} />
        <View
          style={[
            gameCarStyles.wheelSpoke,
            { transform: [{ rotate: "0deg" }] },
          ]}
        />
        <View
          style={[
            gameCarStyles.wheelSpoke,
            { transform: [{ rotate: "90deg" }] },
          ]}
        />
      </Animated.View>
    </Animated.View>
  );
}

const gameCarStyles = StyleSheet.create({
  carContainer: {
    position: "absolute",
    left: 50,
    bottom: GROUND_HEIGHT - 8,
    width: CAR_WIDTH,
    height: CAR_HEIGHT,
  },
  pixel: {
    position: "absolute",
  },
  wheel: {
    position: "absolute",
    width: 16,
    height: 16,
    backgroundColor: "#222",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  wheelInner: {
    width: 8,
    height: 8,
    backgroundColor: "#666",
    borderRadius: 4,
  },
  wheelSpoke: {
    position: "absolute",
    width: 2,
    height: 14,
    backgroundColor: "#444",
  },
});

// Obstacle types for variety
type ObstacleType = "crate" | "barrel" | "cone";

// Single Obstacle component with different types
function Obstacle({
  translateX,
  type = "crate",
  height = OBSTACLE_HEIGHT,
}: {
  translateX: Animated.Value;
  type?: ObstacleType;
  height?: number;
}) {
  const renderCrate = () => (
    <View style={[obstacleStyles.crateBody, { height }]}>
      <View style={[obstacleStyles.plank, { top: 0 }]} />
      <View style={[obstacleStyles.plank, { top: height * 0.25 }]} />
      <View style={[obstacleStyles.plank, { top: height * 0.5 }]} />
      <View style={[obstacleStyles.plank, { top: height * 0.75 }]} />
      <View style={[obstacleStyles.support, { left: 2 }]} />
      <View style={[obstacleStyles.support, { right: 2 }]} />
    </View>
  );

  const renderBarrel = () => (
    <View style={[obstacleStyles.barrel, { height }]}>
      <View style={obstacleStyles.barrelStripe1} />
      <View style={obstacleStyles.barrelStripe2} />
      <View style={obstacleStyles.barrelTop} />
    </View>
  );

  const renderCone = () => (
    <View style={obstacleStyles.coneContainer}>
      <View style={obstacleStyles.cone} />
      <View style={obstacleStyles.coneBase} />
      <View style={obstacleStyles.coneStripe} />
    </View>
  );

  return (
    <Animated.View
      style={[
        obstacleStyles.obstacle,
        {
          transform: [{ translateX }],
          height,
        },
      ]}
    >
      {type === "crate" && renderCrate()}
      {type === "barrel" && renderBarrel()}
      {type === "cone" && renderCone()}
    </Animated.View>
  );
}

// Obstacle data type for tracking multiple obstacles
type ObstacleData = {
  id: number;
  translateX: Animated.Value;
  type: ObstacleType;
  height: number;
  xValue: number;
};

const obstacleStyles = StyleSheet.create({
  obstacle: {
    position: "absolute",
    bottom: GROUND_HEIGHT - 2,
    width: OBSTACLE_WIDTH,
  },
  crateBody: {
    width: "100%",
    backgroundColor: "#8B4513",
    borderWidth: 2,
    borderColor: "#5D3A1A",
  },
  plank: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#5D3A1A",
  },
  support: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: "#6B4423",
  },
  barrel: {
    width: "100%",
    backgroundColor: "#C0392B",
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#922B21",
  },
  barrelStripe1: {
    position: "absolute",
    top: "30%",
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: "#F39C12",
  },
  barrelStripe2: {
    position: "absolute",
    top: "60%",
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: "#F39C12",
  },
  barrelTop: {
    position: "absolute",
    top: 2,
    left: "20%",
    width: "60%",
    height: 6,
    backgroundColor: "#7B241C",
    borderRadius: 2,
  },
  coneContainer: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  cone: {
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderBottomWidth: 35,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#E67E22",
  },
  coneBase: {
    width: 30,
    height: 5,
    backgroundColor: "#2C3E50",
    borderRadius: 2,
  },
  coneStripe: {
    position: "absolute",
    bottom: 15,
    width: 20,
    height: 6,
    backgroundColor: "#FFF",
  },
});

// Main Jump Game Component
function JumpGame() {
  const [gameState, setGameState] = useState<
    "idle" | "playing" | "gameover" | "eaten"
  >("idle");
  const [distance, setDistance] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [obstacles, setObstacles] = useState<ObstacleData[]>([]);

  const jumpY = useRef(new Animated.Value(0)).current;
  const isJumping = useRef(false);
  const jumpCount = useRef(0); // Track number of jumps (0, 1, or 2)
  const currentJumpAnim = useRef<Animated.CompositeAnimation | null>(null);
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jumpYValue = useRef(0);
  const obstacleIdCounter = useRef(0);
  const gameStateRef = useRef(gameState);
  const distanceRef = useRef(0);

  // Keep refs in sync
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    distanceRef.current = distance;
  }, [distance]);

  // Track jump animated value
  useEffect(() => {
    const jumpListener = jumpY.addListener(({ value }) => {
      jumpYValue.current = value;
    });
    return () => {
      jumpY.removeListener(jumpListener);
    };
  }, [jumpY]);

  // Get random obstacle type - easier obstacles
  const getRandomObstacle = useCallback((): {
    type: ObstacleType;
    height: number;
  } => {
    const rand = Math.random();
    const currentDistance = distanceRef.current;

    // More gradual difficulty progression
    if (currentDistance < 200) {
      // Easy start - small obstacles only
      if (rand < 0.5) return { type: "cone", height: 30 };
      return { type: "barrel", height: 25 };
    } else if (currentDistance < 500) {
      // Medium - slightly taller
      if (rand < 0.4) return { type: "crate", height: 30 };
      if (rand < 0.7) return { type: "cone", height: 32 };
      return { type: "barrel", height: 28 };
    } else {
      // Hard (but still manageable)
      if (rand < 0.3) return { type: "crate", height: 35 };
      if (rand < 0.6) return { type: "cone", height: 35 };
      if (rand < 0.85) return { type: "barrel", height: 32 };
      // Occasional taller obstacle
      return { type: "crate", height: 42 };
    }
  }, []);

  // Get spawn delay based on distance - slower progression
  const getSpawnDelay = useCallback((): number => {
    const currentDistance = distanceRef.current;
    const baseDelay = 2500; // More time between obstacles
    const minDelay = 1400; // Never too fast
    const reduction = Math.min(currentDistance * 0.8, baseDelay - minDelay);

    // Add randomness for unpredictability
    const randomFactor = 0.85 + Math.random() * 0.3; // 0.85 to 1.15 (less variation)
    return Math.max(minDelay, (baseDelay - reduction) * randomFactor);
  }, []);

  // Get obstacle speed based on distance - slower obstacles
  const getObstacleSpeed = useCallback((): number => {
    const currentDistance = distanceRef.current;
    const baseSpeed = 3000; // Slower base speed
    const minSpeed = 1800; // Never too fast
    const reduction = Math.min(currentDistance * 0.8, baseSpeed - minSpeed);
    return Math.max(minSpeed, baseSpeed - reduction);
  }, []);

  // Spawn a new obstacle
  const spawnObstacle = useCallback(() => {
    if (gameStateRef.current !== "playing") return;

    const { type, height } = getRandomObstacle();
    const id = obstacleIdCounter.current++;
    const translateX = new Animated.Value(GAME_WIDTH + 20);

    const newObstacle: ObstacleData = {
      id,
      translateX,
      type,
      height,
      xValue: GAME_WIDTH + 20,
    };

    // Track position
    const listener = translateX.addListener(({ value }) => {
      newObstacle.xValue = value;
    });

    setObstacles((prev) => [...prev, newObstacle]);

    // Animate obstacle movement
    const speed = getObstacleSpeed();
    Animated.timing(translateX, {
      toValue: -OBSTACLE_WIDTH - 50,
      duration: speed,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(({ finished }) => {
      translateX.removeListener(listener);
      if (finished) {
        // Remove obstacle when it's off screen
        setObstacles((prev) => prev.filter((o) => o.id !== id));
      }
    });

    // Schedule next obstacle
    const delay = getSpawnDelay();
    spawnTimerRef.current = setTimeout(spawnObstacle, delay);
  }, [getRandomObstacle, getSpawnDelay, getObstacleSpeed]);

  const startGame = useCallback(() => {
    setGameState("playing");
    setDistance(0);
    setObstacles([]);
    jumpY.setValue(0);
    jumpYValue.current = 0;
    isJumping.current = false;
    jumpCount.current = 0;
    if (currentJumpAnim.current) {
      currentJumpAnim.current.stop();
      currentJumpAnim.current = null;
    }
    obstacleIdCounter.current = 0;
    distanceRef.current = 0;

    // Start spawning obstacles after a longer delay to let player prepare
    spawnTimerRef.current = setTimeout(spawnObstacle, 1800);

    // Game loop for collision detection and distance
    gameLoopRef.current = setInterval(() => {
      if (gameStateRef.current !== "playing") return;

      setDistance((d) => {
        distanceRef.current = d + 1;
        return d + 1;
      });

      // Collision detection against all obstacles - forgiving hitboxes
      const carLeft = 50 + 12; // More padding on left
      const carRight = 50 + CAR_WIDTH - 20; // More padding on right
      const carBottom = jumpYValue.current;
      const carTop = carBottom + CAR_HEIGHT - 20;

      setObstacles((currentObstacles) => {
        for (const obs of currentObstacles) {
          const obsLeft = obs.xValue + 5; // Smaller hitbox
          const obsRight = obsLeft + OBSTACLE_WIDTH - 10;
          const obsBottom = 0;
          const obsTop = obs.height - 5; // Slightly shorter hitbox

          // Check collision
          if (
            carRight > obsLeft &&
            carLeft < obsRight &&
            carBottom < obsTop &&
            carTop > obsBottom
          ) {
            // Collision!
            if (gameLoopRef.current) clearInterval(gameLoopRef.current);
            if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
            setGameState("gameover");
            break;
          }
        }
        return currentObstacles;
      });
    }, 30);
  }, [jumpY, spawnObstacle]);

  const jump = useCallback(() => {
    if (gameState !== "playing") return;

    // Allow jump if on ground (jumpCount = 0) or can double jump (jumpCount = 1)
    if (jumpCount.current >= 2) return;

    // Stop current animation if doing a double jump
    if (currentJumpAnim.current && jumpCount.current === 1) {
      currentJumpAnim.current.stop();
    }

    jumpCount.current += 1;
    isJumping.current = true;

    // For double jump, jump from current position to even higher
    const currentY = jumpYValue.current;
    const targetHeight =
      jumpCount.current === 1 ? JUMP_HEIGHT : JUMP_HEIGHT + 40; // Double jump goes higher!

    currentJumpAnim.current = Animated.sequence([
      Animated.timing(jumpY, {
        toValue: targetHeight,
        duration: JUMP_DURATION / 2,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(jumpY, {
        toValue: 0,
        duration: JUMP_DURATION / 2,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    currentJumpAnim.current.start(() => {
      isJumping.current = false;
      jumpCount.current = 0; // Reset jump count when landing
      currentJumpAnim.current = null;
    });
  }, [gameState, jumpY]);

  const handleTigerCaught = useCallback(() => {
    setGameState("eaten");
    setHighScore((prev) => Math.max(prev, distance));
  }, [distance]);

  const resetGame = useCallback(() => {
    setGameState("idle");
    setDistance(0);
    setObstacles([]);
    jumpY.setValue(0);
    jumpCount.current = 0;
    isJumping.current = false;
    if (currentJumpAnim.current) {
      currentJumpAnim.current.stop();
      currentJumpAnim.current = null;
    }
  }, [jumpY]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
      if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
    };
  }, []);

  // Stop game loop when game over
  useEffect(() => {
    if (gameState === "gameover" || gameState === "eaten") {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
      if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
    }
  }, [gameState]);

  return (
    <View style={jumpGameStyles.container}>
      {/* Score display */}
      <View style={jumpGameStyles.scoreContainer}>
        <Text style={jumpGameStyles.scoreText}>
          🏁 {Math.floor(distance / 10)} km
        </Text>
        <Text style={jumpGameStyles.highScoreText}>
          Best: {Math.floor(highScore / 10)} km
        </Text>
      </View>

      {/* Game area - tap to jump */}
      <Pressable
        onPress={gameState === "playing" ? jump : undefined}
        style={jumpGameStyles.gameArea}
      >
        {/* Sky background */}
        <View style={jumpGameStyles.sky}>
          {/* Clouds */}
          <View style={[jumpGameStyles.cloud, { left: 20, top: 15 }]} />
          <View style={[jumpGameStyles.cloud, { left: 120, top: 30 }]} />
          <View style={[jumpGameStyles.cloud, { left: 220, top: 10 }]} />

          {/* Sun */}
          <View style={jumpGameStyles.sun} />
        </View>

        {/* Road */}
        <View style={jumpGameStyles.road}>
          {[...Array(12)].map((_, i) => (
            <View
              key={i}
              style={[jumpGameStyles.roadMarking, { left: i * 35 }]}
            />
          ))}
        </View>

        {/* Game elements */}
        <GameCar jumpY={jumpY} isEaten={gameState === "eaten"} />
        {(gameState === "playing" || gameState === "gameover") &&
          obstacles.map((obs) => (
            <Obstacle
              key={obs.id}
              translateX={obs.translateX}
              type={obs.type}
              height={obs.height}
            />
          ))}
        <GameTiger
          isChasing={gameState === "gameover" || gameState === "eaten"}
          onCaught={handleTigerCaught}
          carPosition={50}
        />

        {/* Overlays */}
        {gameState === "idle" && (
          <View style={jumpGameStyles.overlay}>
            <Pressable style={jumpGameStyles.startButton} onPress={startGame}>
              <Text style={jumpGameStyles.startButtonText}>
                🚗 PUSH TO START
              </Text>
            </Pressable>
            <Text style={jumpGameStyles.instructionText}>
              Tap to jump! Tap again for DOUBLE JUMP! 🦘
            </Text>
            <Text style={jumpGameStyles.instructionText}>
              🐅 Don't let the tiger catch you!
            </Text>
          </View>
        )}

        {gameState === "gameover" && (
          <View style={jumpGameStyles.overlay}>
            <Text style={jumpGameStyles.gameOverText}>💥 CRASH!</Text>
            <Text style={jumpGameStyles.gameOverSubtext}>
              The tiger is coming...
            </Text>
          </View>
        )}

        {gameState === "eaten" && (
          <View style={jumpGameStyles.overlay}>
            <Text style={jumpGameStyles.gameOverText}>🐅 NOM NOM!</Text>
            <Text style={jumpGameStyles.gameOverSubtext}>
              The tiger ate your car!
            </Text>
            <Text style={jumpGameStyles.finalScore}>
              Distance: {Math.floor(distance / 10)} km
            </Text>
            <Pressable style={jumpGameStyles.restartButton} onPress={resetGame}>
              <Text style={jumpGameStyles.restartButtonText}>🔄 TRY AGAIN</Text>
            </Pressable>
          </View>
        )}

        {gameState === "playing" && (
          <View style={jumpGameStyles.tapHint}>
            <Text style={jumpGameStyles.tapHintText}>TAP TO JUMP (x2)!</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const jumpGameStyles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  scoreContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 5,
  },
  scoreText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  highScoreText: {
    fontSize: 14,
    color: "#666",
  },
  gameArea: {
    height: 200,
    backgroundColor: "#87CEEB",
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
  },
  sky: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: GROUND_HEIGHT,
  },
  cloud: {
    position: "absolute",
    width: 50,
    height: 20,
    backgroundColor: "#FFF",
    borderRadius: 10,
    opacity: 0.8,
  },
  sun: {
    position: "absolute",
    right: 20,
    top: 20,
    width: 30,
    height: 30,
    backgroundColor: "#FFD700",
    borderRadius: 15,
  },
  road: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: GROUND_HEIGHT,
    backgroundColor: "#444",
  },
  roadMarking: {
    position: "absolute",
    top: 13,
    width: 20,
    height: 4,
    backgroundColor: "#FFD700",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  startButton: {
    backgroundColor: "#4CAF50",
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    marginBottom: 15,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  startButtonText: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "bold",
  },
  instructionText: {
    color: "#FFF",
    fontSize: 14,
    marginTop: 5,
  },
  gameOverText: {
    color: "#FF4444",
    fontSize: 32,
    fontWeight: "bold",
    textShadowColor: "#000",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  gameOverSubtext: {
    color: "#FFF",
    fontSize: 16,
    marginTop: 10,
  },
  finalScore: {
    color: "#FFD700",
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 15,
  },
  restartButton: {
    backgroundColor: "#FF6B35",
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 20,
    marginTop: 20,
  },
  restartButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  tapHint: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.3)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  tapHintText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "bold",
  },
});

// Pixel art tiger component
function PixelTiger({ translateX }: { translateX: Animated.Value }) {
  const legAnimation = useRef(new Animated.Value(0)).current;
  const bounceY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Running leg animation
    const runAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(legAnimation, {
          toValue: 1,
          duration: 100,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(legAnimation, {
          toValue: 0,
          duration: 100,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]),
    );

    // Bounce while running
    const bounceAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceY, {
          toValue: -3,
          duration: 100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(bounceY, {
          toValue: 0,
          duration: 100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    runAnimation.start();
    bounceAnimation.start();

    return () => {
      runAnimation.stop();
      bounceAnimation.stop();
    };
  }, [legAnimation, bounceY]);

  const frontLegRotate = legAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ["-20deg", "20deg"],
  });

  const backLegRotate = legAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ["20deg", "-20deg"],
  });

  const px = 3;

  return (
    <Animated.View
      style={[
        tigerStyles.tigerContainer,
        {
          transform: [
            { translateX: Animated.subtract(translateX, 80) },
            { translateY: bounceY },
          ],
        },
      ]}
    >
      {/* Tiger body */}
      <View
        style={[
          tigerStyles.pixel,
          {
            width: px * 8,
            height: px * 4,
            backgroundColor: "#FFA500",
            left: px * 2,
            top: px * 2,
          },
        ]}
      />

      {/* Tiger stripes */}
      <View
        style={[
          tigerStyles.pixel,
          {
            width: px * 1,
            height: px * 3,
            backgroundColor: "#222",
            left: px * 4,
            top: px * 2,
          },
        ]}
      />
      <View
        style={[
          tigerStyles.pixel,
          {
            width: px * 1,
            height: px * 3,
            backgroundColor: "#222",
            left: px * 6,
            top: px * 2,
          },
        ]}
      />
      <View
        style={[
          tigerStyles.pixel,
          {
            width: px * 1,
            height: px * 3,
            backgroundColor: "#222",
            left: px * 8,
            top: px * 2,
          },
        ]}
      />

      {/* Tiger head */}
      <View
        style={[
          tigerStyles.pixel,
          {
            width: px * 4,
            height: px * 4,
            backgroundColor: "#FFA500",
            left: px * 10,
            top: px * 1,
          },
        ]}
      />

      {/* Ears */}
      <View
        style={[
          tigerStyles.pixel,
          {
            width: px * 1,
            height: px * 1,
            backgroundColor: "#FFA500",
            left: px * 10,
            top: 0,
          },
        ]}
      />
      <View
        style={[
          tigerStyles.pixel,
          {
            width: px * 1,
            height: px * 1,
            backgroundColor: "#FFA500",
            left: px * 13,
            top: 0,
          },
        ]}
      />

      {/* Face details */}
      <View
        style={[
          tigerStyles.pixel,
          {
            width: px * 1,
            height: px * 1,
            backgroundColor: "#222",
            left: px * 11,
            top: px * 2,
          },
        ]}
      />
      <View
        style={[
          tigerStyles.pixel,
          {
            width: px * 1,
            height: px * 1,
            backgroundColor: "#222",
            left: px * 12,
            top: px * 2,
          },
        ]}
      />
      <View
        style={[
          tigerStyles.pixel,
          {
            width: px * 2,
            height: px * 1,
            backgroundColor: "#FF6B6B",
            left: px * 11,
            top: px * 3,
          },
        ]}
      />

      {/* White muzzle */}
      <View
        style={[
          tigerStyles.pixel,
          {
            width: px * 2,
            height: px * 1,
            backgroundColor: "#FFF",
            left: px * 11,
            top: px * 4,
          },
        ]}
      />

      {/* Tail */}
      <View
        style={[
          tigerStyles.pixel,
          {
            width: px * 3,
            height: px * 1,
            backgroundColor: "#FFA500",
            left: 0,
            top: px * 2,
          },
        ]}
      />
      <View
        style={[
          tigerStyles.pixel,
          {
            width: px * 1,
            height: px * 1,
            backgroundColor: "#222",
            left: 0,
            top: px * 2,
          },
        ]}
      />

      {/* Front legs */}
      <Animated.View
        style={[
          tigerStyles.leg,
          {
            left: px * 8,
            top: px * 5,
            transformOrigin: "top",
            transform: [{ rotate: frontLegRotate }],
          },
        ]}
      />
      <Animated.View
        style={[
          tigerStyles.leg,
          {
            left: px * 9,
            top: px * 5,
            transformOrigin: "top",
            transform: [{ rotate: backLegRotate }],
          },
        ]}
      />

      {/* Back legs */}
      <Animated.View
        style={[
          tigerStyles.leg,
          {
            left: px * 3,
            top: px * 5,
            transformOrigin: "top",
            transform: [{ rotate: backLegRotate }],
          },
        ]}
      />
      <Animated.View
        style={[
          tigerStyles.leg,
          {
            left: px * 4,
            top: px * 5,
            transformOrigin: "top",
            transform: [{ rotate: frontLegRotate }],
          },
        ]}
      />
    </Animated.View>
  );
}

const tigerStyles = StyleSheet.create({
  tigerContainer: {
    position: "absolute",
    bottom: 22,
    width: 50,
    height: 30,
  },
  pixel: {
    position: "absolute",
  },
  leg: {
    position: "absolute",
    width: 4,
    height: 10,
    backgroundColor: "#FFA500",
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
});

// Pixel art car component with animation
function PixelCar() {
  const translateX = useRef(new Animated.Value(-100)).current;
  const wheelRotation = useRef(new Animated.Value(0)).current;
  const bounceY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Car driving animation - moves across the screen
    const driveAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(translateX, {
          toValue: 350,
          duration: 4000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: -100,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    // Wheel spinning animation
    const wheelAnimation = Animated.loop(
      Animated.timing(wheelRotation, {
        toValue: 1,
        duration: 500,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    // Bounce animation for suspension effect
    const bounceAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceY, {
          toValue: -2,
          duration: 150,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(bounceY, {
          toValue: 0,
          duration: 150,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    driveAnimation.start();
    wheelAnimation.start();
    bounceAnimation.start();

    return () => {
      driveAnimation.stop();
      wheelAnimation.stop();
      bounceAnimation.stop();
    };
  }, [translateX, wheelRotation, bounceY]);

  const wheelSpin = wheelRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // Pixel size for the car
  const px = 4;

  return (
    <View style={pixelStyles.roadContainer}>
      {/* Road */}
      <View style={pixelStyles.road}>
        {/* Road markings */}
        {[...Array(8)].map((_, i) => (
          <View key={i} style={[pixelStyles.roadMarking, { left: i * 50 }]} />
        ))}
      </View>

      {/* Pixel Tiger chasing the car */}
      <PixelTiger translateX={translateX} />

      {/* Animated car container */}
      <Animated.View
        style={[
          pixelStyles.carContainer,
          {
            transform: [{ translateX }, { translateY: bounceY }],
          },
        ]}
      >
        {/* Exhaust smoke */}
        <View style={[pixelStyles.smoke, { left: -8, top: 20 }]} />
        <View
          style={[pixelStyles.smoke, { left: -14, top: 18, opacity: 0.5 }]}
        />

        {/* Car body - Main structure using pixel blocks */}
        {/* Top/Roof */}
        <View
          style={[
            pixelStyles.pixel,
            {
              width: px * 6,
              height: px * 3,
              backgroundColor: "#FF4444",
              left: px * 4,
              top: 0,
            },
          ]}
        />

        {/* Windows */}
        <View
          style={[
            pixelStyles.pixel,
            {
              width: px * 2,
              height: px * 2,
              backgroundColor: "#87CEEB",
              left: px * 5,
              top: px * 0.5,
            },
          ]}
        />
        <View
          style={[
            pixelStyles.pixel,
            {
              width: px * 2,
              height: px * 2,
              backgroundColor: "#87CEEB",
              left: px * 8,
              top: px * 0.5,
            },
          ]}
        />

        {/* Main body */}
        <View
          style={[
            pixelStyles.pixel,
            {
              width: px * 14,
              height: px * 4,
              backgroundColor: "#FF4444",
              left: 0,
              top: px * 3,
            },
          ]}
        />

        {/* Hood highlight */}
        <View
          style={[
            pixelStyles.pixel,
            {
              width: px * 4,
              height: px * 1,
              backgroundColor: "#FF6666",
              left: px * 10,
              top: px * 3,
            },
          ]}
        />

        {/* Headlight */}
        <View
          style={[
            pixelStyles.pixel,
            {
              width: px * 1,
              height: px * 2,
              backgroundColor: "#FFFF00",
              left: px * 13,
              top: px * 4,
            },
          ]}
        />

        {/* Taillight */}
        <View
          style={[
            pixelStyles.pixel,
            {
              width: px * 1,
              height: px * 2,
              backgroundColor: "#FF0000",
              left: 0,
              top: px * 4,
            },
          ]}
        />

        {/* Bumpers */}
        <View
          style={[
            pixelStyles.pixel,
            {
              width: px * 2,
              height: px * 1,
              backgroundColor: "#333",
              left: px * 12,
              top: px * 6,
            },
          ]}
        />
        <View
          style={[
            pixelStyles.pixel,
            {
              width: px * 2,
              height: px * 1,
              backgroundColor: "#333",
              left: 0,
              top: px * 6,
            },
          ]}
        />

        {/* Front wheel */}
        <Animated.View
          style={[
            pixelStyles.wheel,
            {
              left: px * 9,
              top: px * 6,
              transform: [{ rotate: wheelSpin }],
            },
          ]}
        >
          <View style={pixelStyles.wheelInner} />
          <View
            style={[
              pixelStyles.wheelSpoke,
              { transform: [{ rotate: "0deg" }] },
            ]}
          />
          <View
            style={[
              pixelStyles.wheelSpoke,
              { transform: [{ rotate: "90deg" }] },
            ]}
          />
        </Animated.View>

        {/* Rear wheel */}
        <Animated.View
          style={[
            pixelStyles.wheel,
            {
              left: px * 2,
              top: px * 6,
              transform: [{ rotate: wheelSpin }],
            },
          ]}
        >
          <View style={pixelStyles.wheelInner} />
          <View
            style={[
              pixelStyles.wheelSpoke,
              { transform: [{ rotate: "0deg" }] },
            ]}
          />
          <View
            style={[
              pixelStyles.wheelSpoke,
              { transform: [{ rotate: "90deg" }] },
            ]}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const pixelStyles = StyleSheet.create({
  roadContainer: {
    height: 100,
    backgroundColor: "#87CEEB",
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 20,
    position: "relative",
  },
  road: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 30,
    backgroundColor: "#444",
  },
  roadMarking: {
    position: "absolute",
    top: 13,
    width: 30,
    height: 4,
    backgroundColor: "#FFD700",
  },
  carContainer: {
    position: "absolute",
    bottom: 22,
    width: 60,
    height: 40,
  },
  pixel: {
    position: "absolute",
  },
  wheel: {
    position: "absolute",
    width: 16,
    height: 16,
    backgroundColor: "#222",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  wheelInner: {
    width: 8,
    height: 8,
    backgroundColor: "#666",
    borderRadius: 4,
  },
  wheelSpoke: {
    position: "absolute",
    width: 2,
    height: 14,
    backgroundColor: "#444",
  },
  smoke: {
    position: "absolute",
    width: 6,
    height: 6,
    backgroundColor: "#ccc",
    borderRadius: 3,
  },
});

export default function App() {
  const [events, setEvents] = useState<string[]>([]);
  const [serverUrl, setServerUrl] = useState("ws://localhost:3847");
  const [secret, setSecret] = useState("");
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
        <Group name="🚗 Jump Game">
          <JumpGame />
        </Group>

        <Group name="Pixel Car Animation">
          <PixelCar />
        </Group>

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
          <View style={styles.urlSection}>
            <Text style={styles.urlSectionTitle}>Dynamic Server URL</Text>
            <TextInput
              style={styles.urlInput}
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="ws://localhost:3847"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.urlInput}
              value={secret}
              onChangeText={setSecret}
              placeholder="Secret (optional)"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button
              title="Set Server URL"
              onPress={() => {
                const url = secret
                  ? `${serverUrl}?secret=${secret}`
                  : serverUrl;
                ExpoAir.setServerUrl(url);
                addEventRef.current("setServerUrl", { url });
              }}
            />
            <Button
              title="Get Current URL"
              onPress={() => {
                const url = ExpoAir.getServerUrl();
                Alert.alert("Current Server URL", url || "(empty)");
              }}
            />
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
    backgroundColor: "pink",
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
  urlSection: {
    marginTop: 16,
    gap: 8,
  },
  urlSectionTitle: {
    fontWeight: "600" as const,
    fontSize: 14,
    marginBottom: 4,
  },
  urlInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    backgroundColor: "#fafafa",
  },
};
