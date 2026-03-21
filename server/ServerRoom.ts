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
import { NetInput, NetState, OnlineRole } from '../src/net/protocol';
import { serializeGameState } from '../src/net/stateSerializer';
import { TICK_DURATION } from '../src/constants';
import { GameMode, PlayerRole, type MenuSelection, SURVIVOR_DEFS, KILLER_DEFS } from '../src/types';

const STATE_SEND_HZ = 45;
const TICKS_PER_STATE = Math.round(60 / STATE_SEND_HZ); // ~1.33 → every 1-2 ticks

const EMPTY_INPUT: NetInput = {
  type: 'input', dx: 0, dy: 0,
  interact: false, interactHeld: false, ability: false, walk: false, space: false,
};

export interface ServerRoomCallbacks {
  /** Send state to a specific role's client */
  sendState: (role: OnlineRole, state: NetState) => void;
  /** Broadcast state to all connected clients */
  broadcastState: (state: NetState) => void;
  /** Broadcast sound event to all clients */
  broadcastSound: (name: string) => void;
}

export class ServerRoom {
  readonly game: Game;
  private tickInterval: ReturnType<typeof setInterval>;
  private tick = 0;

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

  constructor(selection: MenuSelection, callbacks: ServerRoomCallbacks) {
    this.callbacks = callbacks;

    // Create headless game — no canvas, no input, no audio
    this.game = new Game(null, null, selection, true);

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
    // Inject inputs
    const s1Input = this.inputs.survivor1;
    const s2Input = this.inputs.survivor2;
    const kInput = this.inputs.killer;

    this.game.guest1Input = s1Input;
    this.game.guest2Input = s2Input;
    this.game.killerInput = kInput;

    // Clear one-shot flags after consumption
    this.inputs.survivor1 = { ...s1Input, interact: false, ability: false, space: false };
    this.inputs.survivor2 = { ...s2Input, interact: false, ability: false, space: false };
    this.inputs.killer = { ...kInput, interact: false, ability: false, space: false };

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
      this.callbacks.broadcastState(state);
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
    const sDef = SURVIVOR_DEFS.find((d) => d.abilityName === survivorDefId) ?? SURVIVOR_DEFS[0];
    const s2Def = SURVIVOR_DEFS.find((d) => d.abilityName === survivor2DefId) ?? SURVIVOR_DEFS[1] ?? SURVIVOR_DEFS[0];
    const kDef = KILLER_DEFS.find((d) => d.abilityName === killerDefId) ?? KILLER_DEFS[0];

    return {
      mode: GameMode.Online,
      playerRole: PlayerRole.Survivor, // Not meaningful on server, but required
      survivorDef: sDef,
      survivor2Def: s2Def,
      killerDef: kDef,
    };
  }
}
