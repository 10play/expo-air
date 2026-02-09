// Main game component
export { GTA2Game } from "./components/GTA2Game";

// Types
export type { Tile, Dir, CarData, NpcData, GameState } from "./types";

// Constants
export * from "./constants";

// Assets
export { TILES, PLAYER_SPRITES, NPC_SPRITES, CAR_ASSETS } from "./assets";

// Map utilities
export { MAP, canMoveTo } from "./map";

// Initial data
export { PLAYER_START_X, PLAYER_START_Y, INITIAL_CARS, INITIAL_NPCS } from "./initialData";

// Helpers
export { DIRECTIONS, angleToDirection, getDirectionVelocity, clamp, getRandomDirection } from "./helpers";
