// Tile & Map
export const TILE_SIZE = 16;
export const MAP_COLS = 50;
export const MAP_ROWS = 50;

// Viewport
export const CANVAS_WIDTH = 800;
export const GAME_HEIGHT = 600;
export const HUD_HEIGHT = 100;
export const CANVAS_HEIGHT = GAME_HEIGHT + HUD_HEIGHT;

// Fog of War
export const FOG_RADIUS_SURVIVOR = 4;
export const FOG_RADIUS_KILLER = 5;

// Movement (px/s)
export const SURVIVOR_RUN_SPEED = 100;
export const SURVIVOR_WALK_SPEED = 45;
export const KILLER_BASE_SPEED = 92;
export const KILLER_WALK_SPEED = 42;

// Gameplay
export const GENERATORS_ON_MAP = 5;
export const GENERATORS_TO_POWER = 3;
export const GENERATOR_REPAIR_TIME = 45; // seconds
export const HOOK_STAGE_DURATION = 30; // seconds per stage
export const TERROR_RADIUS = 12; // tiles

// Game Loop
export const TICK_RATE = 60;
export const TICK_DURATION = 1 / TICK_RATE;

// Colors (placeholder sprites)
export const COLOR_FLOOR = '#1a1a2e';
export const COLOR_WALL = '#3a3a5c';
export const COLOR_SURVIVOR = '#00ff88';
export const COLOR_KILLER = '#ff2244';
export const COLOR_FOG = '#000000';
export const COLOR_FOG_EDGE = 'rgba(0,0,0,0.5)';
