import { Dir } from "./types";

// All possible directions
export const DIRECTIONS: Dir[] = ["south", "west", "north", "east"];

/**
 * Converts a radian angle to a cardinal direction
 */
export function angleToDirection(angle: number): Dir {
  const deg = ((angle * 180) / Math.PI + 360) % 360;

  if (deg >= 315 || deg < 45) return "east";
  if (deg >= 45 && deg < 135) return "south";
  if (deg >= 135 && deg < 225) return "west";
  return "north";
}

/**
 * Gets the velocity components for a given direction
 */
export function getDirectionVelocity(dir: Dir, speed: number): { dx: number; dy: number } {
  switch (dir) {
    case "east":
      return { dx: speed, dy: 0 };
    case "west":
      return { dx: -speed, dy: 0 };
    case "south":
      return { dx: 0, dy: speed };
    case "north":
      return { dx: 0, dy: -speed };
  }
}

/**
 * Clamps a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Gets a random direction
 */
export function getRandomDirection(): Dir {
  return DIRECTIONS[Math.floor(Math.random() * 4)];
}
