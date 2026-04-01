/**
 * Network protocol message types for online multiplayer.
 *
 * Architecture: Dedicated server runs the Game simulation.
 * All clients (killer + survivors) send inputs, receive state.
 */

export type OnlineRole = 'killer' | 'survivor1' | 'survivor2';

// ─── Client → Server messages ───

/** Client → Server: Input state each frame */
export interface NetInput {
  type: 'input';
  role?: OnlineRole;
  dx: number;
  dy: number;
  interact: boolean;
  interactHeld: boolean;
  ability: boolean;
  walk: boolean;
  space: boolean; // skill check / self-unhook
  tick?: number; // client-local tick counter for server reconciliation
}

/** Client → Server: Skill check result (client runs skill check locally) */
export interface NetSkillCheckResult {
  type: 'sc_result';
  result: 'great' | 'good' | 'miss';
}

/** Client → Server: Character selection */
export interface NetCharSelect {
  type: 'char_select';
  defId: string;
}

/** Ready signal */
export interface NetReady {
  type: 'ready';
}

/** Host/client → Server: Signal to start the game */
export interface NetStartGame {
  type: 'start_game';
}

// ─── Server → Client messages ───

/** Server → Clients: Game initialization (same seed = same map) */
export interface NetGameStart {
  type: 'game_start';
  seed: number;
  survivorDef: string; // ability id
  survivor2Def: string;
  killerDef: string;
  survivorColor: string;
  survivor2Color: string;
  killerColor: string;
}

/** Server → Clients: Compact game state snapshot (sent at ~45Hz) */
export interface NetState {
  type: 'state';
  tick: number;
  // Phase
  phase: string;
  gensCompleted: number;
  gatesPowered: boolean;
  inChase: boolean;
  terrorIntensity: number;
  // Character IDs (e.g. 'runner'/'dodger', 'trapper'/'huntress')
  sId: string;
  s2Id: string;
  kId: string;
  // Survivor1 [x, y, prevX, prevY, health(0-3), dir(0-3), moving, walking, animTime]
  s: number[];
  // Survivor2 [x, y, prevX, prevY, health(0-3), dir(0-3), moving, walking, animTime]
  s2: number[];
  // Killer [x, y, prevX, prevY, dir(0-3), moving, walking, stunTime, atkCooldown, carrying, animTime]
  k: number[];
  // Generators: [progress, completed(0/1), repairing(0/1), regressing(0/1)][]
  g: number[][];
  // Hooks: [hookedFlag(0/1), stage, timer, canSelfUnhook(0/1), rescueProgress, selfUnhookProgress][]
  h: number[][];
  // Pallets: [dropped(0/1), destroyed(0/1), x, y, w, h][]
  p: number[][];
  // Exit gates: [powered(0/1), isOpen(0/1), openProgress][]
  gt: number[][];
  // Traps: [x, y, armed(0/1), trapped(0/1)][]
  tr: number[][];
  // Axes: [x, y, alive(0/1)][]
  ax: number[][];
  // Scratch marks: [x, y, alpha][]
  sm: number[][];
  // Skill check per survivor
  sc: { active: boolean; angle: number; ts: number; te: number; gs: number; ge: number; result?: string } | null;
  sc2: { active: boolean; angle: number; ts: number; te: number; gs: number; ge: number; result?: string } | null;
  // Ability cooldowns [cooldownRemaining, isActive(0/1)]
  sa: number[];
  s2a: number[];
  ka: number[];
  // Lockers: [occupant (0=empty, 1=survivor1, 2=survivor2)][]
  l: number[];
  // Wraith cloak: [cloakState(0-3), cloakProgress(0-1)]
  cl: number[];
  // Server reconciliation: last processed client tick per role
  ackTick: number;
  ackTick2: number;
  ackTickK: number;
}

/** Server → Client: Sound effect trigger */
export interface NetSound {
  type: 'sound';
  name: string;
}

export type NetMessage = NetGameStart | NetInput | NetState | NetSound | NetCharSelect | NetReady | NetStartGame | NetSkillCheckResult;

// ─── Helpers ───

const DIR_MAP = ['down', 'up', 'left', 'right'] as const;
const HEALTH_MAP = ['healthy', 'injured', 'dying', 'dead'] as const;

export function dirToNum(dir: string): number {
  return DIR_MAP.indexOf(dir as typeof DIR_MAP[number]);
}

export function numToDir(n: number): string {
  return DIR_MAP[n] || 'down';
}

export function healthToNum(h: string): number {
  return HEALTH_MAP.indexOf(h as typeof HEALTH_MAP[number]);
}

export function numToHealth(n: number): string {
  return HEALTH_MAP[n] || 'healthy';
}
