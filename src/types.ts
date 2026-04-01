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

export enum GameMode {
  VsCPU = 'vs_cpu',
  Online = 'online',
}

export interface CharacterDef {
  id: string;
  name: string;
  nameJp: string;
  description: string;
  color: string;
  abilityName: string;
}

export const SURVIVOR_DEFS: CharacterDef[] = [
  { id: 'runner', name: 'Dwight', nameJp: 'ドワット', description: 'スプリントバースト: 3秒間 速度2倍 (CT 40秒)', color: '#00ff88', abilityName: 'sprint_burst' },
  { id: 'dodger', name: 'Fenley', nameJp: 'フェンリー', description: 'デッドハード: 0.5秒 無敵ダッシュ (CT 60秒)', color: '#00ccff', abilityName: 'dead_hard' },
  { id: 'strong', name: 'David Quinn', nameJp: 'デイビッド＝クイーン', description: 'ボディブロック: 体当たりで担がれた仲間を救助 (CT 60秒)', color: '#ff9933', abilityName: 'body_block' },
];

export const KILLER_DEFS: CharacterDef[] = [
  { id: 'trapper', name: 'Trapper', nameJp: 'トラッパー', description: 'ベアトラップ: 罠を設置 (最大2個, CT 20秒)', color: '#ff2244', abilityName: 'trap' },
  { id: 'huntress', name: 'Huntress', nameJp: 'ハントレス', description: '斧投擲: 遠距離攻撃 (CT 10秒)', color: '#ff6644', abilityName: 'throw_axe' },
  { id: 'wraith', name: 'Wraith', nameJp: 'レイス', description: '透明化: 姿を消して高速移動 (解除2秒/発動1秒)', color: '#6644cc', abilityName: 'cloak' },
];

export interface MenuSelection {
  mode: GameMode;
  playerRole: PlayerRole;
  survivorDef: CharacterDef;
  /** Second survivor (bot-controlled) */
  survivor2Def: CharacterDef;
  killerDef: CharacterDef;
}
