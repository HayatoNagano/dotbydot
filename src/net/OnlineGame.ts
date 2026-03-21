/**
 * Online multiplayer wrapper around Game.
 *
 * Host (killer): runs Game simulation, reads local input for killer,
 *   receives guest inputs for survivors, broadcasts state to all guests.
 * Guest (survivor): client-side prediction for own survivor,
 *   interpolation buffer for other characters, server reconciliation.
 */

import { Game } from '../core/Game';
import { Input } from '../core/Input';
import { NetworkClient, ServerMessage } from './NetworkClient';
import {
  NetState, NetInput, NetMessage,
  dirToNum, numToDir, healthToNum, numToHealth,
} from './protocol';
import { MenuSelection } from '../ui/Menu';
import { HealthState, GamePhase, Direction } from '../types';
import { TrapAbility } from '../abilities/TrapAbility';
import { ThrowAxe } from '../abilities/ThrowAxe';
import { Trap } from '../entities/Trap';
import { Axe } from '../entities/Axe';
import { audioManager } from '../audio/AudioManager';
import { SkillCheck } from '../ui/SkillCheck';

const STATE_SEND_INTERVAL = 1 / 30; // 30Hz state updates
const FULL_STATE_INTERVAL = 1;       // Full state every 1s for reliability

/** Buffered snapshot for entity interpolation */
interface Snapshot {
  time: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  direction: number;
  isMoving: boolean;
  walking: boolean;
  animTime: number;
}

const EMPTY_INPUT: NetInput = {
  type: 'input', dx: 0, dy: 0,
  interact: false, interactHeld: false, ability: false, walk: false, space: false,
};

export class OnlineGame {
  game: Game;
  private net: NetworkClient;
  private isHost: boolean;
  /** Which survivor this guest controls (0 or 1). Only meaningful for guests. */
  private guestIndex: number;
  private stateSendTimer = 0;
  private fullStateTimer = 0;
  private tick = 0;

  // ─── Host state: remote inputs from guests (survivors) ───
  private guestInputs: NetInput[] = [{ ...EMPTY_INPUT }, { ...EMPTY_INPUT }];

  // ─── Guest-side prediction & interpolation ───
  /** Last input sent by this guest (for local prediction) */
  private lastLocalInput = { dx: 0, dy: 0, walk: false };
  /** Interpolation buffers for remote characters on guest side */
  private killerSnapshots: Snapshot[] = [];
  private survivorSnapshots: Snapshot[] = []; // the OTHER survivor
  /** Time tracking for interpolation */
  private interpTime = 0;
  private readonly INTERP_DELAY = 0.066; // 66ms = 2 state updates at 30Hz
  private readonly RECONCILE_BLEND = 0.3;
  private lastReceivedTick = 0;

  constructor(
    canvas: HTMLCanvasElement,
    input: Input,
    selection: MenuSelection,
    net: NetworkClient,
    isHost: boolean,
    guestIndex = 0,
  ) {
    this.net = net;
    this.isHost = isHost;
    this.guestIndex = guestIndex;

    // Both host and guest create Game with same selection (same seeds → same map)
    this.game = new Game(canvas, input, selection);

    // Set which survivor this player controls
    if (!isHost) {
      this.game.localSurvivor = guestIndex === 0 ? this.game.survivor : this.game.survivor2;
    }

    // Listen for relay messages
    this.onMessage = this.onMessage.bind(this);
    net.onMessage(this.onMessage);

    // If host, send game_start to all guests
    if (isHost) {
      net.relay({
        type: 'game_start',
        seed: this.game.map.seed,
        survivorDef: selection.survivorDef.abilityName,
        survivor2Def: selection.survivor2Def.abilityName,
        killerDef: selection.killerDef.abilityName,
        survivorColor: selection.survivorDef.color,
        survivor2Color: selection.survivor2Def.color,
        killerColor: selection.killerDef.color,
      });
    }
  }

  private onMessage(msg: ServerMessage): void {
    if (msg.type !== 'relay') return;
    const data = msg.data as NetMessage;

    if (this.isHost) {
      // Host receives guest (survivor) inputs, tagged with guestIndex
      if (data.type === 'input') {
        const gi = (msg as { guestIndex?: number }).guestIndex ?? 0;
        if (gi >= 0 && gi < 2) {
          this.guestInputs[gi] = data;
          if (gi === 0) this.guest1Connected = true;
          if (gi === 1) this.guest2Connected = true;
        }
      }
    } else {
      // Guest receives state updates
      if (data.type === 'state') {
        this.applyState(data);
      } else if (data.type === 'sound') {
        this.playSound(data.name);
      }
    }
  }

  update(dt: number): void {
    if (this.isHost) {
      this.updateHost(dt);
    } else {
      this.updateGuest(dt);
    }
  }

  private updateHost(dt: number): void {
    // Host plays as killer — Game reads killer input from local Input (WASD/E/Q)
    // Inject guest inputs for survivors
    this.injectGuestInputs();

    // Run the game simulation
    this.game.update(dt);

    // Periodically send state to all guests
    this.stateSendTimer += dt;
    this.fullStateTimer += dt;
    if (this.stateSendTimer >= STATE_SEND_INTERVAL) {
      this.stateSendTimer = 0;
      this.tick++;
      this.sendState();
    }
  }

  /** Guest-side update: predict own survivor movement locally */
  private updateGuest(dt: number): void {
    this.interpTime += dt;

    if (this.game.phase !== GamePhase.Playing) return;

    // Client-side prediction for this guest's survivor
    const mySurvivor = this.guestIndex === 0 ? this.game.survivor : this.game.survivor2;

    if (!mySurvivor.isIncapacitated && mySurvivor.health !== HealthState.Dead) {
      const { dx, dy, walk } = this.lastLocalInput;
      if (dx !== 0 || dy !== 0) {
        mySurvivor.walking = walk;
        mySurvivor.move(dx, dy, dt, this.game.map);
      } else {
        mySurvivor.prevX = mySurvivor.pos.x;
        mySurvivor.prevY = mySurvivor.pos.y;
      }
    }

    // Interpolate remote characters
    // Killer always interpolated from buffer
    this.interpolateEntity(this.killerSnapshots, this.game.killer);
    // The other survivor interpolated from buffer
    const otherSurvivor = this.guestIndex === 0 ? this.game.survivor2 : this.game.survivor;
    this.interpolateEntity(this.survivorSnapshots, otherSurvivor);

    // Update fog and camera for this survivor's view
    const s = this.game.survivor;
    const s2 = this.game.survivor2;
    this.game.survivorFog.updateMultiple([
      { x: s.centerX, y: s.centerY },
      { x: s2.centerX, y: s2.centerY },
    ]);
    // Camera follows this guest's survivor
    this.game.survivorCamera.follow({ x: mySurvivor.centerX, y: mySurvivor.centerY });

    // Killer fog/camera also update for rendering
    this.game.killerFog.update(this.game.killer.centerX, this.game.killer.centerY);
    this.game.killerCamera.follow({ x: this.game.killer.centerX, y: this.game.killer.centerY });

    // Update skill check result display timer (cursor position comes from host via applyState)
    const mySC = this.guestIndex === 0 ? this.game.skillCheck1 : this.game.skillCheck2;
    if (mySC.isShowingResult) {
      mySC.update(dt);
    }
  }

  /** Interpolate an entity between buffered snapshots */
  private interpolateEntity(snapshots: Snapshot[], entity: { pos: { x: number; y: number }; prevX: number; prevY: number; isMoving: boolean; walking: boolean; direction: Direction; animTime: number }): void {
    if (snapshots.length < 2) return;

    const renderTime = this.interpTime - this.INTERP_DELAY;

    let from: Snapshot | null = null;
    let to: Snapshot | null = null;

    for (let i = 0; i < snapshots.length - 1; i++) {
      if (snapshots[i].time <= renderTime && snapshots[i + 1].time >= renderTime) {
        from = snapshots[i];
        to = snapshots[i + 1];
        break;
      }
    }

    if (from && to) {
      const duration = to.time - from.time;
      const t = duration > 0 ? Math.min(1, (renderTime - from.time) / duration) : 1;

      entity.prevX = entity.pos.x;
      entity.prevY = entity.pos.y;
      entity.pos.x = from.x + (to.x - from.x) * t;
      entity.pos.y = from.y + (to.y - from.y) * t;
      entity.isMoving = to.isMoving;
      entity.walking = to.walking;
      entity.direction = numToDir(to.direction) as Direction;
      entity.animTime = from.animTime + (to.animTime - from.animTime) * t;
    } else if (snapshots.length > 0) {
      const last = snapshots[snapshots.length - 1];
      entity.direction = numToDir(last.direction) as Direction;
      entity.isMoving = last.isMoving;
      entity.walking = last.walking;
    }

    while (snapshots.length > 2 && snapshots[0].time < renderTime - 1.0) {
      snapshots.shift();
    }
  }

  /** Host passes guest survivor inputs to Game via guestInput fields (no key injection) */
  private injectGuestInputs(): void {
    // Guest 0 → survivor1, Guest 1 → survivor2
    // Set input fields that Game.update() reads instead of AI.
    // No key injection — avoids conflicting with host's WASD (killer).
    if (this.guest1Connected) this.game.guest1Input = this.guestInputs[0];
    if (this.guest2Connected) this.game.guest2Input = this.guestInputs[1];
  }

  /** Track which guests have sent at least one input */
  private guest1Connected = false;
  private guest2Connected = false;

  /** Previous sent input for deduplication */
  private prevSentInput: NetInput = { ...EMPTY_INPUT };
  private inputSendTimer = 0;
  private readonly INPUT_SEND_INTERVAL = 1 / 30; // Cap input send rate to 30Hz

  /** Send local input to host (guest calls this) */
  sendInput(input: Input, dt: number): void {
    if (this.isHost) return;

    // Guest plays as survivor, reads WASD
    let dx = 0, dy = 0;
    if (input.isDown('KeyW')) dy -= 1;
    if (input.isDown('KeyS')) dy += 1;
    if (input.isDown('KeyA')) dx -= 1;
    if (input.isDown('KeyD')) dx += 1;

    this.lastLocalInput = { dx, dy, walk: input.isDown('ShiftLeft') };

    const msg: NetInput = {
      type: 'input',
      dx, dy,
      interact: input.wasPressed('KeyE'),
      interactHeld: input.isDown('KeyE'),
      ability: input.wasPressed('KeyQ'),
      walk: input.isDown('ShiftLeft'),
      space: input.wasPressed('Space'),
    };

    // Always send immediately if one-shot actions are pressed (interact, ability, space)
    const hasOneShot = msg.interact || msg.ability || msg.space;

    // Otherwise, rate-limit to 30Hz and only send if input changed
    this.inputSendTimer += dt;
    const inputChanged = msg.dx !== this.prevSentInput.dx || msg.dy !== this.prevSentInput.dy
      || msg.interactHeld !== this.prevSentInput.interactHeld || msg.walk !== this.prevSentInput.walk;

    if (hasOneShot || (this.inputSendTimer >= this.INPUT_SEND_INTERVAL && inputChanged)) {
      this.inputSendTimer = 0;
      this.prevSentInput = msg;
      this.net.relay(msg);
    }
  }

  /** Round to 1 decimal place to shrink JSON (~30% smaller numbers) */
  private r(n: number): number {
    return Math.round(n * 10) / 10;
  }

  private sendState(): void {
    const g = this.game;
    const s = g.survivor;
    const s2 = g.survivor2;
    const k = g.killer;
    const r = this.r.bind(this);

    // Send scratch marks less frequently (every 5th state = 6Hz) for bandwidth
    const sendFullState = this.fullStateTimer >= FULL_STATE_INTERVAL;
    if (sendFullState) this.fullStateTimer = 0;
    const sendScratchMarks = this.tick % 5 === 0;

    const state: NetState = {
      type: 'state',
      tick: this.tick,
      phase: g.phase,
      gensCompleted: g.generatorsCompleted,
      gatesPowered: g.gatesPowered,
      inChase: g.inChase,
      terrorIntensity: 0,
      sId: s.characterId,
      s2Id: s2.characterId,
      kId: k.characterId,
      s: [
        r(s.pos.x), r(s.pos.y), r(s.prevX), r(s.prevY),
        healthToNum(s.health), dirToNum(s.direction),
        s.isMoving ? 1 : 0, s.walking ? 1 : 0, r(s.animTime),
      ],
      s2: [
        r(s2.pos.x), r(s2.pos.y), r(s2.prevX), r(s2.prevY),
        healthToNum(s2.health), dirToNum(s2.direction),
        s2.isMoving ? 1 : 0, s2.walking ? 1 : 0, r(s2.animTime),
      ],
      k: [
        r(k.pos.x), r(k.pos.y), r(k.prevX), r(k.prevY),
        dirToNum(k.direction), k.isMoving ? 1 : 0, k.walking ? 1 : 0,
        r(k.stunTimer), r(k.attackCooldown), k.isCarrying ? 1 : 0, r(k.animTime),
      ],
      g: g.generators.map((gen) => [r(gen.progress), gen.completed ? 1 : 0, gen.beingRepaired ? 1 : 0, gen.regressing ? 1 : 0]),
      h: g.hooks.map((h) => [h.hooked ? 1 : 0, h.stage, r(h.stageTimer), h.canSelfUnhook ? 1 : 0, r(h.rescueProgress)]),
      p: g.pallets.map((p) => [p.dropped ? 1 : 0, p.isDestroyed ? 1 : 0, r(p.pos.x), r(p.pos.y), p.width, p.height]),
      gt: g.exitGates.map((gt) => [gt.powered ? 1 : 0, gt.isOpen ? 1 : 0, r(gt.openProgress)]),
      tr: (g.killerAbility instanceof TrapAbility ? g.killerAbility.traps : [])
        .map((t) => [r(t.pos.x), r(t.pos.y), t.armed ? 1 : 0, t.trapped ? 1 : 0]),
      ax: (g.killerAbility instanceof ThrowAxe ? g.killerAbility.axes : [])
        .filter((a) => a.alive)
        .map((a) => [r(a.pos.x), r(a.pos.y), a.alive ? 1 : 0]),
      sm: sendScratchMarks
        ? g.scratchMarks.allMarks.slice(-20).map((m) => [r(m.x), r(m.y), r(m.age)])
        : [],
      sc: this.serializeSkillCheck(g.skillCheck1),
      sc2: this.serializeSkillCheck(g.skillCheck2),
      sa: [r(g.survivorAbility?.cooldownRemaining ?? 0), g.survivorAbility?.isActive ? 1 : 0],
      s2a: [r(g.survivor2Ability?.cooldownRemaining ?? 0), g.survivor2Ability?.isActive ? 1 : 0],
      ka: [r(g.killerAbility?.cooldownRemaining ?? 0), g.killerAbility?.isActive ? 1 : 0],
    };

    this.net.relay(state);
  }

  private serializeSkillCheck(sc: SkillCheck): NetState['sc'] {
    if (sc.active) {
      return {
        active: true,
        angle: sc.cursor,
        ts: sc.targetStart,
        te: sc.targetStart + sc.targetWidth,
        gs: sc.greatStart,
        ge: sc.greatStart + sc.greatWidth,
      };
    }
    if (sc.isShowingResult) {
      return {
        active: false,
        angle: 0, ts: 0, te: 0, gs: 0, ge: 0,
        result: sc.lastResult,
      };
    }
    return null;
  }

  private applyState(state: NetState): void {
    const g = this.game;
    const s = g.survivor;
    const s2 = g.survivor2;
    const k = g.killer;

    // Phase
    g.phase = state.phase as GamePhase;
    g.generatorsCompleted = state.gensCompleted;
    g.gatesPowered = state.gatesPowered;

    // Chase music
    if (state.inChase && !g.inChase) {
      g.inChase = true;
      audioManager.startChase();
    } else if (!state.inChase && g.inChase) {
      g.inChase = false;
      audioManager.stopChase();
    }

    // Character IDs
    if (state.sId) s.characterId = state.sId;
    if (state.s2Id) s2.characterId = state.s2Id;
    if (state.kId) k.characterId = state.kId;

    // My survivor: server reconciliation (blend toward authoritative position)
    // The other survivor: interpolation buffer
    const mySurvivor = this.guestIndex === 0 ? s : s2;
    const otherSurvivor = this.guestIndex === 0 ? s2 : s;
    const myData = this.guestIndex === 0 ? state.s : state.s2;
    const otherData = this.guestIndex === 0 ? state.s2 : state.s;

    // ─── My Survivor: server reconciliation ───
    const serverX = myData[0];
    const serverY = myData[1];
    const errorX = serverX - mySurvivor.pos.x;
    const errorY = serverY - mySurvivor.pos.y;
    const errorDist = Math.sqrt(errorX * errorX + errorY * errorY);

    if (errorDist > 100) {
      mySurvivor.pos.x = serverX;
      mySurvivor.pos.y = serverY;
      mySurvivor.prevX = myData[2];
      mySurvivor.prevY = myData[3];
    } else if (errorDist > 2) {
      mySurvivor.pos.x += errorX * this.RECONCILE_BLEND;
      mySurvivor.pos.y += errorY * this.RECONCILE_BLEND;
    }
    mySurvivor.health = numToHealth(myData[4]) as HealthState;
    mySurvivor.direction = numToDir(myData[5]) as Direction;
    mySurvivor.isMoving = myData[6] === 1;
    mySurvivor.walking = myData[7] === 1;

    // ─── Other Survivor: buffer for interpolation ───
    this.survivorSnapshots.push({
      time: this.interpTime,
      x: otherData[0], y: otherData[1], prevX: otherData[2], prevY: otherData[3],
      direction: otherData[5], isMoving: otherData[6] === 1, walking: otherData[7] === 1, animTime: otherData[8],
    });
    otherSurvivor.health = numToHealth(otherData[4]) as HealthState;

    // ─── Killer: buffer for interpolation ───
    const kd = state.k;
    this.killerSnapshots.push({
      time: this.interpTime,
      x: kd[0], y: kd[1], prevX: kd[2], prevY: kd[3],
      direction: kd[4], isMoving: kd[5] === 1, walking: kd[6] === 1, animTime: kd[10],
    });
    k.stunTimer = kd[7];
    k.attackCooldown = kd[8];
    if (kd[9] === 1) {
      k.carrying = s.health === HealthState.Dying ? s : s2;
    } else {
      k.carrying = null;
    }
    // Sync isBeingCarried for correct rendering
    s.isBeingCarried = k.carrying === s;
    s2.isBeingCarried = k.carrying === s2;

    // Generators
    state.g.forEach((gd, i) => {
      if (i < g.generators.length) {
        g.generators[i].progress = gd[0];
        g.generators[i].completed = gd[1] === 1;
        g.generators[i].beingRepaired = gd[2] === 1;
        g.generators[i].regressing = (gd[3] ?? 0) === 1;
      }
    });

    // Hooks
    state.h.forEach((hd, i) => {
      if (i < g.hooks.length) {
        if (hd[0] === 1) {
          const hookX = g.hooks[i].pos.x;
          const hookY = g.hooks[i].pos.y;
          const d1 = Math.abs(s.pos.x - hookX) + Math.abs(s.pos.y - hookY);
          const d2 = Math.abs(s2.pos.x - hookX) + Math.abs(s2.pos.y - hookY);
          g.hooks[i].hooked = d1 < d2 ? s : s2;
        } else {
          g.hooks[i].hooked = null;
        }
        g.hooks[i].stage = hd[1];
        g.hooks[i].stageTimer = hd[2];
        g.hooks[i].rescueProgress = hd[4] ?? 0;
      }
    });

    // Pallets
    state.p.forEach((pd, i) => {
      if (i < g.pallets.length) {
        g.pallets[i].dropped = pd[0] === 1;
        if (pd[1] === 1 && !g.pallets[i].isDestroyed) {
          g.pallets[i].pos.x = -9999;
          g.pallets[i].pos.y = -9999;
        } else {
          g.pallets[i].pos.x = pd[2];
          g.pallets[i].pos.y = pd[3];
          g.pallets[i].width = pd[4];
          g.pallets[i].height = pd[5];
        }
      }
    });

    // Exit gates
    state.gt.forEach((gtd, i) => {
      if (i < g.exitGates.length) {
        g.exitGates[i].powered = gtd[0] === 1;
        g.exitGates[i].isOpen = gtd[1] === 1;
        g.exitGates[i].openProgress = gtd[2];
      }
    });

    // Traps
    const trapAbility = g.killerAbility instanceof TrapAbility ? g.killerAbility as TrapAbility : null;
    if (trapAbility) {
      while (trapAbility.traps.length < state.tr.length) {
        trapAbility.traps.push(new Trap(0, 0));
      }
      while (trapAbility.traps.length > state.tr.length) {
        trapAbility.traps.pop();
      }
      state.tr.forEach((td, i) => {
        trapAbility.traps[i].pos.x = td[0];
        trapAbility.traps[i].pos.y = td[1];
        trapAbility.traps[i].armed = td[2] === 1;
        trapAbility.traps[i].trapped = td[3] === 1 ? s : null;
      });
    }

    // Axes
    const throwAxeAbility = g.killerAbility instanceof ThrowAxe ? g.killerAbility as ThrowAxe : null;
    if (throwAxeAbility) {
      while (throwAxeAbility.axes.length < state.ax.length) {
        throwAxeAbility.axes.push(new Axe(0, 0, Direction.Down));
      }
      while (throwAxeAbility.axes.length > state.ax.length) {
        throwAxeAbility.axes.pop();
      }
      state.ax.forEach((ad, i) => {
        throwAxeAbility.axes[i].pos.x = ad[0];
        throwAxeAbility.axes[i].pos.y = ad[1];
        throwAxeAbility.axes[i].alive = ad[2] === 1;
      });
    }

    // Skill check — apply host's skill check state to this guest's survivor
    const mySCData = this.guestIndex === 0 ? state.sc : state.sc2;
    const mySC = this.guestIndex === 0 ? g.skillCheck1 : g.skillCheck2;
    if (mySCData && mySCData.active) {
      mySC.active = true;
      mySC.cursor = mySCData.angle;
      mySC.targetStart = mySCData.ts;
      mySC.targetWidth = mySCData.te - mySCData.ts;
      mySC.greatStart = mySCData.gs;
      mySC.greatWidth = mySCData.ge - mySCData.gs;
    } else if (mySCData && mySCData.result) {
      if (mySC.active) {
        mySC.showResult(mySCData.result as 'great' | 'good' | 'miss');
      }
    } else {
      mySC.active = false;
    }

    this.lastReceivedTick = state.tick;
  }

  private playSound(name: string): void {
    const fn = (audioManager as unknown as Record<string, unknown>)[name];
    if (typeof fn === 'function') fn.call(audioManager);
  }

  render(alpha: number): void {
    this.game.render(alpha);
  }

  get phase(): GamePhase {
    return this.game.phase;
  }

  destroy(): void {
    this.net.removeListener(this.onMessage);
  }
}
