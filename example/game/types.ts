import { ImageSourcePropType } from "react-native";

// Tile types for the map
export type Tile = "road" | "swalk" | "grass" | "bld1" | "bld2" | "bld3";

// Direction for character movement and sprites
export type Dir = "south" | "west" | "north" | "east";

// Car entity data
export type CarData = {
  id: string;
  sprite: ImageSourcePropType;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
};

// NPC entity data
export type NpcData = {
  id: string;
  x: number;
  y: number;
  dir: Dir;
  frame: number;
  state: "idle" | "walk";
  timer: number;
  ft: number; // frame timer
};

// Game State
export type GameState = {
  px: number;      // player x
  py: number;      // player y
  pdir: Dir;       // player direction
  pf: number;      // player frame
  pft: number;     // player frame timer
  cx: number;      // camera x
  cy: number;      // camera y
  ja: number;      // joystick angle
  jm: number;      // joystick magnitude
  npcs: NpcData[];
  cars: CarData[];
};
