/**
 * Network protocol message types for online multiplayer.
 *
 * Architecture: Host runs the Game simulation. Guest sends inputs, receives state.
 * The relay server just forwards messages between host and guest.
 */

// ─── Relay payload types (sent inside { type: 'relay', data: ... }) ───

/** Host → Guest: Game initialization (same seed = same map) */
export interface NetGameStart {
  type: 'game_start';
  seed: number;
  survivorDef: string; // ability id
  killerDef: string;
  survivorColor: string;
  killerColor: string;
}

/** Guest → Host: Input state each frame */
export interface NetInput {
  type: 'input';
  dx: number;
  dy: number;
  interact: boolean;
  interactHeld: boolean;
  ability: boolean;
  walk: boolean;
  space: boolean; // skill check / self-unhook
}

/** Host → Guest: Compact game state snapshot (sent at ~15Hz) */
export interface NetState {
  type: 'state';
  tick: number;
  // Phase
  phase: string;
  gensCompleted: number;
  gatesPowered: boolean;
  inChase: boolean;
  terrorIntensity: number;
  // Survivor [x, y, prevX, prevY, health(0-3), dir(0-3), moving, walking, animTime]
  s: number[];
  // Killer [x, y, prevX, prevY, dir(0-3), moving, walking, stunTime, atkCooldown, carrying, animTime]
  k: number[];
  // Generators: [progress, completed(0/1), repairing(0/1)][]
  g: number[][];
  // Hooks: [hookedFlag(0/1), stage, timer, canSelfUnhook(0/1)][]
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
  // Skill check (for survivor guest)
  sc: { active: boolean; angle: number; ts: number; te: number; gs: number; ge: number } | null;
  // Ability cooldowns [cooldownRemaining, isActive(0/1)]
  sa: number[];
  ka: number[];
}

/** Host → Guest / Guest → Host: Sound effect trigger */
export interface NetSound {
  type: 'sound';
  name: string;
}

/** Host → Guest: Character selection options */
export interface NetCharSelect {
  type: 'char_select';
  defId: string;
}

/** Ready signal */
export interface NetReady {
  type: 'ready';
}

export type NetMessage = NetGameStart | NetInput | NetState | NetSound | NetCharSelect | NetReady;

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
