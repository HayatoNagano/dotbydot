/**
 * ServerRoom: Runs a headless Game instance on the dedicated server.
 *
 * One ServerRoom per active game. Manages:
 * - 60Hz game loop (setInterval)
 * - Input injection for all roles (killer, survivor1, survivor2)
 * - State broadcast at 45Hz
 * - Sound event forwarding
 * - One-shot input flag accumulation
 */

import { Game } from '../src/core/Game';
import { NetInput, NetState, NetDeltaState, DELTA_MASK, OnlineRole } from '../src/net/protocol';
import { serializeGameState, computeDeltaState } from '../src/net/stateSerializer';
import { TICK_DURATION } from '../src/constants';
import { GameMode, PlayerRole, type MenuSelection, SURVIVOR_DEFS, KILLER_DEFS } from '../src/types';

const STATE_SEND_HZ = 45;
const TICKS_PER_STATE = Math.round(60 / STATE_SEND_HZ); // ~1.33 → every 1-2 ticks

/**
 * Low-priority world objects are sent every Nth state broadcast (~15Hz).
 * Character positions (high priority) are sent every broadcast (~45Hz).
 */
const WORLD_SEND_INTERVAL = 3; // 45Hz / 3 = 15Hz

/** Bitmask for low-priority world object fields */
const LOW_PRIORITY_MASK =
  DELTA_MASK.G | DELTA_MASK.H | DELTA_MASK.P | DELTA_MASK.GT |
  DELTA_MASK.L | DELTA_MASK.TR | DELTA_MASK.AX | DELTA_MASK.CL;

const EMPTY_INPUT: NetInput = {
  type: 'input', dx: 0, dy: 0,
  interact: false, interactHeld: false, ability: false, walk: false, space: false,
};

export interface ServerRoomCallbacks {
  /** Send state to a specific role's client */
  sendState: (role: OnlineRole, state: NetState) => void;
  /** Broadcast state to all connected clients */
  broadcastState: (state: NetState | NetDeltaState) => void;
  /** Broadcast sound event to all clients */
  broadcastSound: (name: string) => void;
}

/** Send full state every N state broadcasts for delta sync recovery */
const FULL_STATE_INTERVAL = 30; // ~every 0.67s at 45Hz

export class ServerRoom {
  readonly game: Game;
  private tickInterval: ReturnType<typeof setInterval>;
  private tick = 0;

  /** Previous full state for delta computation */
  private prevState: NetState | null = null;
  /** Counter for full state sends */
  private stateBroadcastCount = 0;

  /** Current input per role */
  private inputs: Record<OnlineRole, NetInput> = {
    killer: { ...EMPTY_INPUT },
    survivor1: { ...EMPTY_INPUT },
    survivor2: { ...EMPTY_INPUT },
  };

  /** Last received tick counter per role (for ack) */
  private lastClientTick: Record<OnlineRole, number> = {
    killer: 0,
    survivor1: 0,
    survivor2: 0,
  };

  private callbacks: ServerRoomCallbacks;

  /** Roles controlled by bots (no human player) */
  private botRoles: Set<OnlineRole>;

  constructor(selection: MenuSelection, callbacks: ServerRoomCallbacks, botRoles: OnlineRole[] = []) {
    this.callbacks = callbacks;
    this.botRoles = new Set(botRoles);

    // Create headless game — no canvas, no input, no audio
    this.game = new Game(null, null, selection, true, botRoles);

    // Sound events → broadcast to all clients
    this.game.soundCallback = (name: string) => {
      this.callbacks.broadcastSound(name);
    };

    // Start 60Hz game loop
    this.tickInterval = setInterval(() => this.serverTick(), TICK_DURATION * 1000);
  }

  /** Receive input from a client */
  setInput(role: OnlineRole, input: NetInput): void {
    // Accumulate one-shot flags (OR with existing) to prevent loss between ticks
    const prev = this.inputs[role];
    if (prev.interact) input.interact = true;
    if (prev.ability) input.ability = true;
    if (prev.space) input.space = true;
    if (input.interact) input.interactHeld = true;

    this.inputs[role] = input;
    if (input.tick !== undefined) {
      this.lastClientTick[role] = input.tick;
    }
  }

  /** Apply a skill check result from a client */
  applySkillCheckResult(role: OnlineRole, result: 'great' | 'good' | 'miss'): void {
    const sc = role === 'survivor2' ? this.game.skillCheck2 : this.game.skillCheck1;
    if (sc.active) {
      sc.applyResult(result);
      // Sound will be emitted by Game through soundCallback
    }
  }

  private serverTick(): void {
    // Inject inputs — skip bot roles (they use AI in Game)
    if (!this.botRoles.has('survivor1')) {
      this.game.guest1Input = this.inputs.survivor1;
      this.inputs.survivor1 = { ...this.inputs.survivor1, interact: false, ability: false, space: false };
    }
    if (!this.botRoles.has('survivor2')) {
      this.game.guest2Input = this.inputs.survivor2;
      this.inputs.survivor2 = { ...this.inputs.survivor2, interact: false, ability: false, space: false };
    }
    if (!this.botRoles.has('killer')) {
      this.game.killerInput = this.inputs.killer;
      this.inputs.killer = { ...this.inputs.killer, interact: false, ability: false, space: false };
    }

    // Run simulation
    this.game.update(TICK_DURATION);

    // Broadcast state at ~45Hz
    this.tick++;
    if (this.tick % TICKS_PER_STATE === 0) {
      const sendScratchMarks = this.tick % (TICKS_PER_STATE * 5) === 0;
      const state = serializeGameState(
        this.game,
        this.tick,
        [this.lastClientTick.survivor1, this.lastClientTick.survivor2, this.lastClientTick.killer],
        sendScratchMarks,
      );

      this.stateBroadcastCount++;
      const isFullSync = !this.prevState || this.stateBroadcastCount % FULL_STATE_INTERVAL === 0;

      if (isFullSync) {
        // Send full state periodically for sync recovery
        this.callbacks.broadcastState(state);
        this.prevState = state;
      } else {
        // Send delta only
        const delta = computeDeltaState(state, this.prevState);

        // Priority-based rate control: strip low-priority world objects on non-world ticks.
        // When stripping, do NOT update prevState for those fields — keep the old baseline
        // so the change is re-detected on the next world tick.
        const isWorldTick = this.stateBroadcastCount % WORLD_SEND_INTERVAL === 0;
        if (!isWorldTick) {
          delta.mask &= ~LOW_PRIORITY_MASK;
          delete delta.g;
          delete delta.h;
          delete delta.p;
          delete delta.gt;
          delete delta.l;
          delete delta.tr;
          delete delta.ax;
          delete delta.cl;

          // Partial prevState update: only high-priority fields advance
          this.prevState = {
            ...this.prevState,
            tick: state.tick,
            phase: state.phase,
            gensCompleted: state.gensCompleted,
            gatesPowered: state.gatesPowered,
            inChase: state.inChase,
            sId: state.sId, s2Id: state.s2Id, kId: state.kId,
            s: state.s, s2: state.s2, k: state.k,
            sm: state.sm,
            sc: state.sc, sc2: state.sc2,
            sa: state.sa, s2a: state.s2a, ka: state.ka,
            ackTick: state.ackTick, ackTick2: state.ackTick2, ackTickK: state.ackTickK,
          };
        } else {
          // World tick: update everything
          this.prevState = state;
        }

        this.callbacks.broadcastState(delta);
      }
    }
  }

  destroy(): void {
    clearInterval(this.tickInterval);
  }

  /** Build a MenuSelection from character def IDs */
  static buildSelection(
    survivorDefId: string,
    survivor2DefId: string,
    killerDefId: string,
  ): MenuSelection {
    const sDef = SURVIVOR_DEFS.find((d) => d.id === survivorDefId) ?? SURVIVOR_DEFS[0];
    const s2Def = SURVIVOR_DEFS.find((d) => d.id === survivor2DefId) ?? SURVIVOR_DEFS[1] ?? SURVIVOR_DEFS[0];
    const kDef = KILLER_DEFS.find((d) => d.id === killerDefId) ?? KILLER_DEFS[0];

    return {
      mode: GameMode.Online,
      playerRole: PlayerRole.Survivor, // Not meaningful on server, but required
      survivorDef: sDef,
      survivor2Def: s2Def,
      killerDef: kDef,
    };
  }
}
