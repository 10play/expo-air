import { ImageSourcePropType } from "react-native";
import { Tile, Dir } from "./types";

// Tile textures
export const TILES: Record<Tile, ImageSourcePropType> = {
  road: require("../assets/gta2/tiles/road_plain.png"),
  swalk: require("../assets/gta2/tiles/sidewalk.png"),
  grass: require("../assets/gta2/tiles/grass.png"),
  bld1: require("../assets/gta2/tiles/building_1.png"),
  bld2: require("../assets/gta2/tiles/building_2.png"),
  bld3: require("../assets/gta2/tiles/building_3.png"),
};

// Player sprites (3 frames per direction for walk animation)
export const PLAYER_SPRITES: Record<Dir, ImageSourcePropType[]> = {
  south: [
    require("../assets/gta2/characters/player_south_0.png"),
    require("../assets/gta2/characters/player_south_1.png"),
    require("../assets/gta2/characters/player_south_2.png"),
  ],
  west: [
    require("../assets/gta2/characters/player_west_0.png"),
    require("../assets/gta2/characters/player_west_1.png"),
    require("../assets/gta2/characters/player_west_2.png"),
  ],
  north: [
    require("../assets/gta2/characters/player_north_0.png"),
    require("../assets/gta2/characters/player_north_1.png"),
    require("../assets/gta2/characters/player_north_2.png"),
  ],
  east: [
    require("../assets/gta2/characters/player_east_0.png"),
    require("../assets/gta2/characters/player_east_1.png"),
    require("../assets/gta2/characters/player_east_2.png"),
  ],
};

// NPC sprites (3 frames per direction for walk animation)
export const NPC_SPRITES: Record<Dir, ImageSourcePropType[]> = {
  south: [
    require("../assets/gta2/characters/npc_south_0.png"),
    require("../assets/gta2/characters/npc_south_1.png"),
    require("../assets/gta2/characters/npc_south_2.png"),
  ],
  west: [
    require("../assets/gta2/characters/npc_west_0.png"),
    require("../assets/gta2/characters/npc_west_1.png"),
    require("../assets/gta2/characters/npc_west_2.png"),
  ],
  north: [
    require("../assets/gta2/characters/npc_north_0.png"),
    require("../assets/gta2/characters/npc_north_1.png"),
    require("../assets/gta2/characters/npc_north_2.png"),
  ],
  east: [
    require("../assets/gta2/characters/npc_east_0.png"),
    require("../assets/gta2/characters/npc_east_1.png"),
    require("../assets/gta2/characters/npc_east_2.png"),
  ],
};

// Vehicle sprites
export const CAR_ASSETS = {
  alfa: require("../assets/gta2/vehicles/alfa.png"),
  bmw: require("../assets/gta2/vehicles/bmw.png"),
  taxi: require("../assets/gta2/vehicles/taxi.png"),
  pickup: require("../assets/gta2/vehicles/pickup.png"),
  bug: require("../assets/gta2/vehicles/bug.png"),
  spider: require("../assets/gta2/vehicles/spider.png"),
};
