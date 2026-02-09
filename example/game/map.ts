import { Tile } from "./types";
import { COLS, ROWS, TILE_SIZE, HITBOX } from "./constants";

// Road and sidewalk layout configuration
const ROAD_COLS = new Set([3, 4, 9, 10, 15, 16]);
const ROAD_ROWS = new Set([4, 5, 11, 12, 18, 19]);
const SIDEWALK_COLS = new Set([2, 5, 8, 11, 14, 17]);
const SIDEWALK_ROWS = new Set([3, 6, 10, 13, 17]);

// Tiles the player/NPCs can walk on
const WALKABLE_TILES = new Set<Tile>(["road", "swalk", "grass"]);

/**
 * Generates the game map based on predefined road/sidewalk patterns
 */
function buildMap(): Tile[][] {
  const map: Tile[][] = [];

  for (let row = 0; row < ROWS; row++) {
    const rowTiles: Tile[] = [];

    for (let col = 0; col < COLS; col++) {
      if (ROAD_COLS.has(col) || ROAD_ROWS.has(row)) {
        rowTiles.push("road");
      } else if (SIDEWALK_COLS.has(col) || SIDEWALK_ROWS.has(row)) {
        rowTiles.push("swalk");
      } else {
        // Park area: rows 7-9, cols 12-13
        if (row >= 7 && row <= 9 && col >= 12 && col <= 13) {
          rowTiles.push("grass");
        } else {
          // Alternate building types by block for variety
          const blockRow = row < 3 ? 0 : row < 10 ? 1 : 2;
          const blockCol = col < 2 ? 0 : col < 8 ? 1 : col < 14 ? 2 : 3;
          const variant = (blockRow + blockCol) % 3;
          rowTiles.push(variant === 0 ? "bld1" : variant === 1 ? "bld2" : "bld3");
        }
      }
    }
    map.push(rowTiles);
  }

  return map;
}

// Pre-built map for the game
export const MAP = buildMap();

/**
 * Checks if a position is walkable (all corners of hitbox are on walkable tiles)
 */
export function canMoveTo(x: number, y: number): boolean {
  const half = HITBOX;
  const corners = [
    [x - half, y - half],
    [x + half, y - half],
    [x - half, y + half],
    [x + half, y + half],
  ];

  return corners.every(([cx, cy]) => {
    const col = Math.floor(cx / TILE_SIZE);
    const row = Math.floor(cy / TILE_SIZE);

    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) {
      return false;
    }

    return WALKABLE_TILES.has(MAP[row][col]);
  });
}
