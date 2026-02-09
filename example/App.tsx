import "@10play/expo-air/build/hmrReconnect";
import ExpoAir from "@10play/expo-air";
import { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  ImageSourcePropType,
  PanResponder,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";

// ═══════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════
const { width: SW, height: SH } = Dimensions.get("window");
const T = 64; // tile size
const COLS = 20;
const ROWS = 20;
const MAP_W = COLS * T;
const MAP_H = ROWS * T;
const P_SIZE = 48; // player render size (3x scale from ~16px sprite)
const P_SPEED = 3;
const NPC_SPEED = 1.5;
const TICK = 33; // ~30fps
const HITBOX = 14; // collision hitbox half-size

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════
type Tile = "road" | "swalk" | "grass" | "bld1" | "bld2" | "bld3";
type Dir = "south" | "west" | "north" | "east";

type CarData = {
  id: string;
  sprite: ImageSourcePropType;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
};

type NpcData = {
  id: string;
  x: number;
  y: number;
  dir: Dir;
  frame: number;
  state: "idle" | "walk";
  timer: number;
  ft: number; // frame timer
};

type GS = {
  px: number;
  py: number;
  pdir: Dir;
  pf: number; // player frame
  pft: number; // player frame timer
  cx: number;
  cy: number;
  ja: number; // joystick angle
  jm: number; // joystick magnitude
  npcs: NpcData[];
  cars: CarData[];
};

// ═══════════════════════════════════════════
// Assets
// ═══════════════════════════════════════════
const TILES: Record<Tile, ImageSourcePropType> = {
  road: require("./assets/gta2/tiles/road_plain.png"),
  swalk: require("./assets/gta2/tiles/sidewalk.png"),
  grass: require("./assets/gta2/tiles/grass.png"),
  bld1: require("./assets/gta2/tiles/building_1.png"),
  bld2: require("./assets/gta2/tiles/building_2.png"),
  bld3: require("./assets/gta2/tiles/building_3.png"),
};

const PLAYER_SPR: Record<Dir, ImageSourcePropType[]> = {
  south: [
    require("./assets/gta2/characters/player_south_0.png"),
    require("./assets/gta2/characters/player_south_1.png"),
    require("./assets/gta2/characters/player_south_2.png"),
  ],
  west: [
    require("./assets/gta2/characters/player_west_0.png"),
    require("./assets/gta2/characters/player_west_1.png"),
    require("./assets/gta2/characters/player_west_2.png"),
  ],
  north: [
    require("./assets/gta2/characters/player_north_0.png"),
    require("./assets/gta2/characters/player_north_1.png"),
    require("./assets/gta2/characters/player_north_2.png"),
  ],
  east: [
    require("./assets/gta2/characters/player_east_0.png"),
    require("./assets/gta2/characters/player_east_1.png"),
    require("./assets/gta2/characters/player_east_2.png"),
  ],
};

const NPC_SPR: Record<Dir, ImageSourcePropType[]> = {
  south: [
    require("./assets/gta2/characters/npc_south_0.png"),
    require("./assets/gta2/characters/npc_south_1.png"),
    require("./assets/gta2/characters/npc_south_2.png"),
  ],
  west: [
    require("./assets/gta2/characters/npc_west_0.png"),
    require("./assets/gta2/characters/npc_west_1.png"),
    require("./assets/gta2/characters/npc_west_2.png"),
  ],
  north: [
    require("./assets/gta2/characters/npc_north_0.png"),
    require("./assets/gta2/characters/npc_north_1.png"),
    require("./assets/gta2/characters/npc_north_2.png"),
  ],
  east: [
    require("./assets/gta2/characters/npc_east_0.png"),
    require("./assets/gta2/characters/npc_east_1.png"),
    require("./assets/gta2/characters/npc_east_2.png"),
  ],
};

const CAR_ASSETS = {
  alfa: require("./assets/gta2/vehicles/alfa.png"),
  bmw: require("./assets/gta2/vehicles/bmw.png"),
  taxi: require("./assets/gta2/vehicles/taxi.png"),
  pickup: require("./assets/gta2/vehicles/pickup.png"),
  bug: require("./assets/gta2/vehicles/bug.png"),
  spider: require("./assets/gta2/vehicles/spider.png"),
};

// ═══════════════════════════════════════════
// Map Generation
// ═══════════════════════════════════════════
const ROAD_C = new Set([3, 4, 9, 10, 15, 16]);
const ROAD_R = new Set([4, 5, 11, 12, 18, 19]);
const SWALK_C = new Set([2, 5, 8, 11, 14, 17]);
const SWALK_R = new Set([3, 6, 10, 13, 17]);

function buildMap(): Tile[][] {
  const map: Tile[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: Tile[] = [];
    for (let c = 0; c < COLS; c++) {
      if (ROAD_C.has(c) || ROAD_R.has(r)) {
        row.push("road");
      } else if (SWALK_C.has(c) || SWALK_R.has(r)) {
        row.push("swalk");
      } else {
        // Park area: rows 7-9, cols 12-13
        if (r >= 7 && r <= 9 && c >= 12 && c <= 13) {
          row.push("grass");
        } else {
          // Alternate building types by block for variety
          const blockR = r < 3 ? 0 : r < 10 ? 1 : 2;
          const blockC = c < 2 ? 0 : c < 8 ? 1 : c < 14 ? 2 : 3;
          const variant = (blockR + blockC) % 3;
          row.push(variant === 0 ? "bld1" : variant === 1 ? "bld2" : "bld3");
        }
      }
    }
    map.push(row);
  }
  return map;
}

const MAP = buildMap();
const WALKABLE = new Set<Tile>(["road", "swalk", "grass"]);

function canMoveTo(x: number, y: number): boolean {
  const half = HITBOX;
  const corners = [
    [x - half, y - half],
    [x + half, y - half],
    [x - half, y + half],
    [x + half, y + half],
  ];
  return corners.every(([cx, cy]) => {
    const col = Math.floor(cx / T);
    const row = Math.floor(cy / T);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
    return WALKABLE.has(MAP[row][col]);
  });
}

// ═══════════════════════════════════════════
// Initial Game Data
// ═══════════════════════════════════════════
const INIT_CARS: CarData[] = [
  { id: "c1", sprite: CAR_ASSETS.alfa, x: 3.5 * T, y: 1.5 * T, w: 62, h: 64, rot: 180 },
  { id: "c2", sprite: CAR_ASSETS.bmw, x: 7 * T, y: 4.5 * T, w: 62, h: 64, rot: 90 },
  { id: "c3", sprite: CAR_ASSETS.taxi, x: 9.5 * T, y: 8 * T, w: 60, h: 64, rot: 0 },
  { id: "c4", sprite: CAR_ASSETS.pickup, x: 13 * T, y: 11.5 * T, w: 58, h: 64, rot: 270 },
  { id: "c5", sprite: CAR_ASSETS.bug, x: 15.5 * T, y: 15 * T, w: 50, h: 52, rot: 180 },
  { id: "c6", sprite: CAR_ASSETS.spider, x: 18.5 * T, y: 4.5 * T, w: 54, h: 62, rot: 90 },
];

const INIT_NPCS: NpcData[] = [
  { id: "n1", x: 2 * T + 32, y: 7 * T + 32, dir: "south", frame: 0, state: "walk", timer: 2000, ft: 0 },
  { id: "n2", x: 14 * T + 32, y: 2 * T + 32, dir: "east", frame: 0, state: "idle", timer: 1500, ft: 0 },
  { id: "n3", x: 8 * T + 32, y: 14 * T + 32, dir: "west", frame: 0, state: "walk", timer: 3000, ft: 0 },
  { id: "n4", x: 5 * T + 32, y: 13 * T + 32, dir: "north", frame: 0, state: "walk", timer: 2500, ft: 0 },
];

const PLAYER_START_X = 5 * T + 32; // sidewalk col 5, row 6
const PLAYER_START_Y = 6 * T + 32;

// ═══════════════════════════════════════════
// Virtual Joystick
// ═══════════════════════════════════════════
function Joystick({ gs }: { gs: GS }) {
  const BASE = 120;
  const KNOB = 50;
  const MAX_D = (BASE - KNOB) / 2;

  const [kx, setKx] = useState(0);
  const [ky, setKy] = useState(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {},
      onPanResponderMove: (_, g) => {
        const dist = Math.sqrt(g.dx * g.dx + g.dy * g.dy);
        const angle = Math.atan2(g.dy, g.dx);
        const clamped = Math.min(dist, MAX_D);
        setKx(Math.cos(angle) * clamped);
        setKy(Math.sin(angle) * clamped);
        if (dist > 10) {
          gs.ja = angle;
          gs.jm = clamped / MAX_D;
        } else {
          gs.jm = 0;
        }
      },
      onPanResponderRelease: () => {
        setKx(0);
        setKy(0);
        gs.jm = 0;
      },
      onPanResponderTerminate: () => {
        setKx(0);
        setKy(0);
        gs.jm = 0;
      },
    })
  ).current;

  return (
    <View style={joyS.wrap} pointerEvents="box-none">
      <View style={joyS.container} {...panResponder.panHandlers}>
        <View style={joyS.base}>
          <View
            style={[
              joyS.knob,
              { transform: [{ translateX: kx }, { translateY: ky }] },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const joyS = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: 40,
    left: 20,
    zIndex: 10,
  },
  container: {
    width: 120,
    height: 120,
    justifyContent: "center",
    alignItems: "center",
  },
  base: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  knob: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.5)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.7)",
  },
});

// ═══════════════════════════════════════════
// Directions helper
// ═══════════════════════════════════════════
const DIRS: Dir[] = ["south", "west", "north", "east"];

function angleToDir(angle: number): Dir {
  const deg = ((angle * 180) / Math.PI + 360) % 360;
  if (deg >= 315 || deg < 45) return "east";
  if (deg >= 45 && deg < 135) return "south";
  if (deg >= 135 && deg < 225) return "west";
  return "north";
}

// ═══════════════════════════════════════════
// Main Game Component
// ═══════════════════════════════════════════
function GTA2Game() {
  const [, setTick] = useState(0);

  const gs = useRef<GS>({
    px: PLAYER_START_X,
    py: PLAYER_START_Y,
    pdir: "south",
    pf: 0,
    pft: 0,
    cx: Math.max(0, Math.min(PLAYER_START_X - SW / 2, MAP_W - SW)),
    cy: Math.max(0, Math.min(PLAYER_START_Y - SH / 2, MAP_H - SH)),
    ja: 0,
    jm: 0,
    npcs: INIT_NPCS.map((n) => ({ ...n })),
    cars: INIT_CARS.map((c) => ({ ...c })),
  }).current;

  // Game loop
  useEffect(() => {
    const id = setInterval(() => {
      const g = gs;

      // ── Player Movement ──
      if (g.jm > 0.1) {
        const dx = Math.cos(g.ja) * P_SPEED * g.jm;
        const dy = Math.sin(g.ja) * P_SPEED * g.jm;
        const nx = g.px + dx;
        const ny = g.py + dy;

        // Try full move, then axis-separated
        if (canMoveTo(nx, ny)) {
          g.px = nx;
          g.py = ny;
        } else if (canMoveTo(nx, g.py)) {
          g.px = nx;
        } else if (canMoveTo(g.px, ny)) {
          g.py = ny;
        }

        g.pdir = angleToDir(g.ja);

        // Walk animation
        g.pft += TICK;
        if (g.pft >= 150) {
          g.pft = 0;
          g.pf = (g.pf + 1) % 3;
        }
      } else {
        g.pf = 0;
        g.pft = 0;
      }

      // ── NPC AI ──
      for (const npc of g.npcs) {
        npc.timer -= TICK;

        if (npc.timer <= 0) {
          if (npc.state === "idle") {
            npc.state = "walk";
            npc.dir = DIRS[Math.floor(Math.random() * 4)];
            npc.timer = 2000 + Math.random() * 3000;
          } else {
            npc.state = "idle";
            npc.frame = 0;
            npc.timer = 1000 + Math.random() * 2000;
          }
        }

        if (npc.state === "walk") {
          const dx =
            npc.dir === "east"
              ? NPC_SPEED
              : npc.dir === "west"
                ? -NPC_SPEED
                : 0;
          const dy =
            npc.dir === "south"
              ? NPC_SPEED
              : npc.dir === "north"
                ? -NPC_SPEED
                : 0;
          const nx = npc.x + dx;
          const ny = npc.y + dy;

          if (canMoveTo(nx, ny)) {
            npc.x = nx;
            npc.y = ny;
          } else {
            npc.state = "idle";
            npc.timer = 500;
          }

          npc.ft += TICK;
          if (npc.ft >= 180) {
            npc.ft = 0;
            npc.frame = (npc.frame + 1) % 3;
          }
        }
      }

      // ── Camera ──
      const tcx = Math.max(0, Math.min(g.px - SW / 2, MAP_W - SW));
      const tcy = Math.max(0, Math.min(g.py - SH / 2, MAP_H - SH));
      g.cx += (tcx - g.cx) * 0.12;
      g.cy += (tcy - g.cy) * 0.12;

      setTick((t) => t + 1);
    }, TICK);

    return () => clearInterval(id);
  }, [gs]);

  // ── Viewport Culling ──
  const sc = Math.max(0, Math.floor(gs.cx / T) - 1);
  const ec = Math.min(COLS, Math.ceil((gs.cx + SW) / T) + 1);
  const sr = Math.max(0, Math.floor(gs.cy / T) - 1);
  const er = Math.min(ROWS, Math.ceil((gs.cy + SH) / T) + 1);

  const tiles = [];
  for (let r = sr; r < er; r++) {
    for (let c = sc; c < ec; c++) {
      tiles.push(
        <Image
          key={`${r}-${c}`}
          source={TILES[MAP[r][c]]}
          style={[
            s.tile,
            { left: c * T, top: r * T, width: T, height: T },
          ]}
        />
      );
    }
  }

  const rcx = Math.round(gs.cx);
  const rcy = Math.round(gs.cy);

  return (
    <View style={s.screen}>
      {/* World */}
      <View
        style={[
          s.world,
          { transform: [{ translateX: -rcx }, { translateY: -rcy }] },
        ]}
      >
        {/* Tiles */}
        {tiles}

        {/* Cars */}
        {gs.cars.map((car) => (
          <Image
            key={car.id}
            source={car.sprite}
            style={[
              s.car,
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
        {gs.npcs.map((npc) => (
          <Image
            key={`${npc.id}-${npc.dir}-${npc.frame}`}
            source={NPC_SPR[npc.dir][npc.frame]}
            style={[
              s.sprite,
              {
                left: npc.x - P_SIZE / 2,
                top: npc.y - P_SIZE / 2,
                width: P_SIZE,
                height: P_SIZE,
              },
            ]}
          />
        ))}

        {/* Player */}
        <Image
          key={`p-${gs.pdir}-${gs.pf}`}
          source={PLAYER_SPR[gs.pdir][gs.pf]}
          style={[
            s.sprite,
            {
              left: gs.px - P_SIZE / 2,
              top: gs.py - P_SIZE / 2,
              width: P_SIZE,
              height: P_SIZE,
              zIndex: 10,
            },
          ]}
        />
      </View>

      {/* Joystick */}
      <Joystick gs={gs} />
    </View>
  );
}

// ═══════════════════════════════════════════
// App
// ═══════════════════════════════════════════
export default function App() {
  useEffect(() => {
    ExpoAir.show({ size: 60, color: "#007AFF" });
  }, []);

  return (
    <View style={s.root}>
      <StatusBar hidden />
      <GTA2Game />
    </View>
  );
}

// ═══════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  screen: {
    flex: 1,
    overflow: "hidden",
  },
  world: {
    width: MAP_W,
    height: MAP_H,
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
