export enum TileType {
  Floor = 0,
  Wall = 1,
}

export enum Direction {
  Up = 'up',
  Down = 'down',
  Left = 'left',
  Right = 'right',
}

export interface Vector2 {
  x: number;
  y: number;
}

export enum GamePhase {
  Playing = 'playing',
  SurvivorWin = 'survivor_win',
  KillerWin = 'killer_win',
}

export enum PlayerRole {
  Survivor = 'survivor',
  Killer = 'killer',
}

export enum HealthState {
  Healthy = 'healthy',
  Injured = 'injured',
  Dying = 'dying',
  Dead = 'dead',
}
