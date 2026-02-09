import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { GameState } from "../types";
import {
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  TILE_SIZE,
  COLS,
  ROWS,
  MAP_WIDTH,
  MAP_HEIGHT,
  PLAYER_SIZE,
  PLAYER_SPEED,
  NPC_SPEED,
  TICK,
  PLAYER_ANIM_INTERVAL,
  NPC_ANIM_INTERVAL,
} from "../constants";
import { TILES, PLAYER_SPRITES, NPC_SPRITES } from "../assets";
import { MAP, canMoveTo } from "../map";
import { PLAYER_START_X, PLAYER_START_Y, INITIAL_CARS, INITIAL_NPCS } from "../initialData";
import { angleToDirection, getRandomDirection, getDirectionVelocity } from "../helpers";
import { Joystick } from "./Joystick";

export function GTA2Game() {
  const [, setTick] = useState(0);

  const gameState = useRef<GameState>({
    px: PLAYER_START_X,
    py: PLAYER_START_Y,
    pdir: "south",
    pf: 0,
    pft: 0,
    cx: Math.max(0, Math.min(PLAYER_START_X - SCREEN_WIDTH / 2, MAP_WIDTH - SCREEN_WIDTH)),
    cy: Math.max(0, Math.min(PLAYER_START_Y - SCREEN_HEIGHT / 2, MAP_HEIGHT - SCREEN_HEIGHT)),
    ja: 0,
    jm: 0,
    npcs: INITIAL_NPCS.map((n) => ({ ...n })),
    cars: INITIAL_CARS.map((c) => ({ ...c })),
  }).current;

  // Game loop
  useEffect(() => {
    const intervalId = setInterval(() => {
      const gs = gameState;

      // ── Player Movement ──
      if (gs.jm > 0.1) {
        const dx = Math.cos(gs.ja) * PLAYER_SPEED * gs.jm;
        const dy = Math.sin(gs.ja) * PLAYER_SPEED * gs.jm;
        const newX = gs.px + dx;
        const newY = gs.py + dy;

        // Try full move, then axis-separated
        if (canMoveTo(newX, newY)) {
          gs.px = newX;
          gs.py = newY;
        } else if (canMoveTo(newX, gs.py)) {
          gs.px = newX;
        } else if (canMoveTo(gs.px, newY)) {
          gs.py = newY;
        }

        gs.pdir = angleToDirection(gs.ja);

        // Walk animation
        gs.pft += TICK;
        if (gs.pft >= PLAYER_ANIM_INTERVAL) {
          gs.pft = 0;
          gs.pf = (gs.pf + 1) % 3;
        }
      } else {
        gs.pf = 0;
        gs.pft = 0;
      }

      // ── NPC AI ──
      for (const npc of gs.npcs) {
        npc.timer -= TICK;

        if (npc.timer <= 0) {
          if (npc.state === "idle") {
            npc.state = "walk";
            npc.dir = getRandomDirection();
            npc.timer = 2000 + Math.random() * 3000;
          } else {
            npc.state = "idle";
            npc.frame = 0;
            npc.timer = 1000 + Math.random() * 2000;
          }
        }

        if (npc.state === "walk") {
          const { dx, dy } = getDirectionVelocity(npc.dir, NPC_SPEED);
          const newX = npc.x + dx;
          const newY = npc.y + dy;

          if (canMoveTo(newX, newY)) {
            npc.x = newX;
            npc.y = newY;
          } else {
            npc.state = "idle";
            npc.timer = 500;
          }

          npc.ft += TICK;
          if (npc.ft >= NPC_ANIM_INTERVAL) {
            npc.ft = 0;
            npc.frame = (npc.frame + 1) % 3;
          }
        }
      }

      // ── Camera ──
      const targetCX = Math.max(0, Math.min(gs.px - SCREEN_WIDTH / 2, MAP_WIDTH - SCREEN_WIDTH));
      const targetCY = Math.max(0, Math.min(gs.py - SCREEN_HEIGHT / 2, MAP_HEIGHT - SCREEN_HEIGHT));
      gs.cx += (targetCX - gs.cx) * 0.12;
      gs.cy += (targetCY - gs.cy) * 0.12;

      setTick((t) => t + 1);
    }, TICK);

    return () => clearInterval(intervalId);
  }, [gameState]);

  // ── Viewport Culling ──
  const startCol = Math.max(0, Math.floor(gameState.cx / TILE_SIZE) - 1);
  const endCol = Math.min(COLS, Math.ceil((gameState.cx + SCREEN_WIDTH) / TILE_SIZE) + 1);
  const startRow = Math.max(0, Math.floor(gameState.cy / TILE_SIZE) - 1);
  const endRow = Math.min(ROWS, Math.ceil((gameState.cy + SCREEN_HEIGHT) / TILE_SIZE) + 1);

  const tiles = [];
  for (let row = startRow; row < endRow; row++) {
    for (let col = startCol; col < endCol; col++) {
      tiles.push(
        <Image
          key={`${row}-${col}`}
          source={TILES[MAP[row][col]]}
          style={[
            styles.tile,
            {
              left: col * TILE_SIZE,
              top: row * TILE_SIZE,
              width: TILE_SIZE,
              height: TILE_SIZE,
            },
          ]}
        />
      );
    }
  }

  const roundedCX = Math.round(gameState.cx);
  const roundedCY = Math.round(gameState.cy);

  return (
    <View style={styles.screen}>
      {/* World */}
      <View
        style={[
          styles.world,
          { transform: [{ translateX: -roundedCX }, { translateY: -roundedCY }] },
        ]}
      >
        {/* Tiles */}
        {tiles}

        {/* Cars */}
        {gameState.cars.map((car) => (
          <Image
            key={car.id}
            source={car.sprite}
            style={[
              styles.car,
              {
                left: car.x - car.w / 2,
                top: car.y - car.h / 2,
                width: car.w,
                height: car.h,
                transform: [{ rotate: `${car.rot}deg` }],
              },
            ]}
          />
        ))}

        {/* NPCs */}
        {gameState.npcs.map((npc) => (
          <Image
            key={npc.id}
            source={NPC_SPRITES[npc.dir][npc.frame]}
            style={[
              styles.sprite,
              {
                left: npc.x - PLAYER_SIZE / 2,
                top: npc.y - PLAYER_SIZE / 2,
                width: PLAYER_SIZE,
                height: PLAYER_SIZE,
              },
            ]}
          />
        ))}

        {/* Player */}
        <Image
          key="player"
          source={PLAYER_SPRITES[gameState.pdir][gameState.pf]}
          style={[
            styles.sprite,
            {
              left: gameState.px - PLAYER_SIZE / 2,
              top: gameState.py - PLAYER_SIZE / 2,
              width: PLAYER_SIZE,
              height: PLAYER_SIZE,
              zIndex: 10,
            },
          ]}
        />
      </View>

      {/* Joystick */}
      <Joystick gameState={gameState} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: "hidden",
  },
  world: {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
  },
  tile: {
    position: "absolute",
  },
  car: {
    position: "absolute",
    zIndex: 5,
  },
  sprite: {
    position: "absolute",
    zIndex: 6,
  },
});
