import { CarData, NpcData } from "./types";
import { CAR_ASSETS } from "./assets";
import { TILE_SIZE } from "./constants";

const T = TILE_SIZE;

// Player starting position (sidewalk col 5, row 6)
export const PLAYER_START_X = 5 * T + 32;
export const PLAYER_START_Y = 6 * T + 32;

// Initial car placements
export const INITIAL_CARS: CarData[] = [
  { id: "c1", sprite: CAR_ASSETS.alfa, x: 3.5 * T, y: 1.5 * T, w: 62, h: 64, rot: 180 },
  { id: "c2", sprite: CAR_ASSETS.bmw, x: 7 * T, y: 4.5 * T, w: 62, h: 64, rot: 90 },
  { id: "c3", sprite: CAR_ASSETS.taxi, x: 9.5 * T, y: 8 * T, w: 60, h: 64, rot: 0 },
  { id: "c4", sprite: CAR_ASSETS.pickup, x: 13 * T, y: 11.5 * T, w: 58, h: 64, rot: 270 },
  { id: "c5", sprite: CAR_ASSETS.bug, x: 15.5 * T, y: 15 * T, w: 50, h: 52, rot: 180 },
  { id: "c6", sprite: CAR_ASSETS.spider, x: 18.5 * T, y: 4.5 * T, w: 54, h: 62, rot: 90 },
];

// Initial NPC placements
export const INITIAL_NPCS: NpcData[] = [
  { id: "n1", x: 2 * T + 32, y: 7 * T + 32, dir: "south", frame: 0, state: "walk", timer: 2000, ft: 0 },
  { id: "n2", x: 14 * T + 32, y: 2 * T + 32, dir: "east", frame: 0, state: "idle", timer: 1500, ft: 0 },
  { id: "n3", x: 8 * T + 32, y: 14 * T + 32, dir: "west", frame: 0, state: "walk", timer: 3000, ft: 0 },
  { id: "n4", x: 5 * T + 32, y: 13 * T + 32, dir: "north", frame: 0, state: "walk", timer: 2500, ft: 0 },
];
