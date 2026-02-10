import { Dimensions } from "react-native";

// Screen dimensions
export const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Tile and map configuration
export const TILE_SIZE = 64;
export const COLS = 20;
export const ROWS = 20;
export const MAP_WIDTH = COLS * TILE_SIZE;
export const MAP_HEIGHT = ROWS * TILE_SIZE;

// Player configuration
export const PLAYER_SIZE = 32;    // render size (2x scale from ~16px sprite)
export const PLAYER_SPEED = 3;
export const HITBOX = 14;         // collision hitbox half-size

// NPC configuration
export const NPC_SPEED = 1.5;

// Game loop configuration
export const TICK = 33; // ~30fps

// Animation timing
export const PLAYER_ANIM_INTERVAL = 150;
export const NPC_ANIM_INTERVAL = 180;
