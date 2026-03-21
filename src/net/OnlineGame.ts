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
  NetState, NetInput, NetMessage, NetSkillCheckResult,
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
import { TICK_DURATION } from '../constants';

const STATE_SEND_INTERVAL = 1 / 45; // 45Hz state updates (tighter reconciliation)
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

/** Per-tick prediction entry for server reconciliation replay */
interface PredictionEntry {
  tick: number;
  dx: number;
  dy: number;
  walk: boolean;
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
  /** Last received guest tick per guest (for ack in state updates) */
  private lastGuestTick: number[] = [0, 0];

  // ─── Guest-side prediction & interpolation ───
  /** Last input applied locally (for local prediction) */
  private lastLocalInput = { dx: 0, dy: 0, walk: false };
  /** Per-tick prediction buffer for server reconciliation with replay */
  private localTick = 0;
  private predictionBuffer: PredictionEntry[] = [];
  private readonly MAX_PREDICTION_BUFFER = 600; // 10s at 60Hz
  /** Visual smoothing: offset that absorbs reconciliation jumps and decays over time */
  private smoothOffsetX = 0;
  private smoothOffsetY = 0;
  /** Interpolation buffers for remote characters on guest side */
  private killerSnapshots: Snapshot[] = [];
  private survivorSnapshots: Snapshot[] = []; // the OTHER survivor
  /** Time tracking for interpolation */
  private interpTime = 0;
  private readonly INTERP_DELAY = 0.045; // 45ms = ~2 state updates at 45Hz
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
          // Accumulate one-shot flags so they aren't lost if multiple messages
          // arrive between game ticks (the last message would otherwise overwrite)
          const prev = this.guestInputs[gi];
          if (prev.interact) data.interact = true;
          if (prev.ability) data.ability = true;
          if (prev.space) data.space = true;
          // If a one-shot interact was accumulated, also ensure interactHeld is true
          // (pressing implies holding for at least that tick)
          if (data.interact) data.interactHeld = true;
          this.guestInputs[gi] = data;
          if (data.tick !== undefined) this.lastGuestTick[gi] = data.tick;
          if (gi === 0) this.guest1Connected = true;
          if (gi === 1) this.guest2Connected = true;
        }
      }
      // Host receives skill check results from guests
      if (data.type === 'sc_result') {
        const gi = (msg as { guestIndex?: number }).guestIndex ?? 0;
        const sc = gi === 0 ? this.game.skillCheck1 : this.game.skillCheck2;
        const result = (data as NetSkillCheckResult).result;
        if (sc.active) {
          // Apply the guest's result on the host's authoritative skillCheck
          sc.applyResult(result);
          switch (result) {
            case 'great': audioManager.playSkillCheckGreat(); break;
            case 'good': audioManager.playSkillCheckGood(); break;
            case 'miss': audioManager.playSkillCheckMiss(); break;
          }
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

    // Decay visual smooth offset each tick
    this.smoothOffsetX *= 0.85;
    this.smoothOffsetY *= 0.85;
    if (Math.abs(this.smoothOffsetX) < 0.1) this.smoothOffsetX = 0;
    if (Math.abs(this.smoothOffsetY) < 0.1) this.smoothOffsetY = 0;

    if (this.game.phase !== GamePhase.Playing) return;

    // Client-side prediction for this guest's survivor
    const mySurvivor = this.guestIndex === 0 ? this.game.survivor : this.game.survivor2;

    const inLocker = this.game.lockers.some((l) => l.occupant === mySurvivor);
    if (!mySurvivor.isIncapacitated && mySurvivor.health !== HealthState.Dead && !inLocker) {
      const { dx, dy, walk } = this.lastLocalInput;

      // Record this tick in prediction buffer for server reconciliation replay
      this.localTick++;
      this.predictionBuffer.push({ tick: this.localTick, dx, dy, walk });
      if (this.predictionBuffer.length > this.MAX_PREDICTION_BUFFER) {
        this.predictionBuffer.splice(0, this.predictionBuffer.length - this.MAX_PREDICTION_BUFFER);
      }

      if (dx !== 0 || dy !== 0) {
        mySurvivor.walking = walk;
        mySurvivor.move(dx, dy, dt, this.game.map);
      } else {
        mySurvivor.isMoving = false;
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

    // Skill check runs LOCALLY on guest at 60fps for responsive input
    const mySC = this.guestIndex === 0 ? this.game.skillCheck1 : this.game.skillCheck2;
    mySC.update(dt);
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

  /** Replay a single tick of movement (position only, no animation side effects) */
  private replayMove(
    entity: { pos: { x: number; y: number }; width: number; height: number; speed: number },
    dx: number, dy: number, walk: boolean,
  ): void {
    if (dx === 0 && dy === 0) return;
    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len;
    dy /= len;
    const speed = walk ? entity.speed * 0.45 : entity.speed;
    const moveX = dx * speed * TICK_DURATION;
    const moveY = dy * speed * TICK_DURATION;

    const nextX = entity.pos.x + moveX;
    if (!this.game.map.collidesRect(nextX, entity.pos.y, entity.width, entity.height)) {
      entity.pos.x = nextX;
    }
    const nextY = entity.pos.y + moveY;
    if (!this.game.map.collidesRect(entity.pos.x, nextY, entity.width, entity.height)) {
      entity.pos.y = nextY;
    }
  }

  /** Host passes guest survivor inputs to Game via guestInput fields (no key injection) */
  private injectGuestInputs(): void {
    // Guest 0 → survivor1, Guest 1 → survivor2
    // Set input fields that Game.update() reads instead of AI.
    // No key injection — avoids conflicting with host's WASD (killer).
    if (this.guest1Connected) {
      this.game.guest1Input = this.guestInputs[0];
      // Clear one-shot flags after consumption so they fire only once
      this.guestInputs[0] = { ...this.guestInputs[0], interact: false, ability: false, space: false };
    }
    if (this.guest2Connected) {
      this.game.guest2Input = this.guestInputs[1];
      this.guestInputs[1] = { ...this.guestInputs[1], interact: false, ability: false, space: false };
    }
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

    // Handle skill check Space press locally — run hit() on guest, send result to host
    const spacePressed = input.wasPressed('Space');
    const mySC = this.guestIndex === 0 ? this.game.skillCheck1 : this.game.skillCheck2;
    let spaceForHost = spacePressed; // Forward to host for self-unhook etc.

    if (spacePressed && mySC.active) {
      // Skill check is active — handle locally
      const result = mySC.hit();
      switch (result) {
        case 'great': audioManager.playSkillCheckGreat(); break;
        case 'good': audioManager.playSkillCheckGood(); break;
        case 'miss': audioManager.playSkillCheckMiss(); break;
      }
      // Send result to host so it can apply repair bonus
      this.net.relay({ type: 'sc_result', result } as NetSkillCheckResult);
      spaceForHost = false; // Don't also send as regular space input
    }

    const msg: NetInput = {
      type: 'input',
      dx, dy,
      interact: input.wasPressed('KeyE'),
      interactHeld: input.isDown('KeyE'),
      ability: input.wasPressed('KeyQ'),
      walk: input.isDown('ShiftLeft'),
      space: spaceForHost,
      tick: this.localTick,
    };

    // Always send immediately if one-shot actions are pressed (interact, ability, space)
    const hasOneShot = msg.interact || msg.ability || msg.space;

    // Send immediately on input change or one-shot actions; rate-limit unchanged input to 30Hz
    this.inputSendTimer += dt;
    const inputChanged = msg.dx !== this.prevSentInput.dx || msg.dy !== this.prevSentInput.dy
      || msg.interactHeld !== this.prevSentInput.interactHeld || msg.walk !== this.prevSentInput.walk;

    if (hasOneShot || inputChanged || this.inputSendTimer >= this.INPUT_SEND_INTERVAL) {
      this.inputSendTimer = 0;
      this.prevSentInput = msg;
      this.net.relay(msg);
    }
  }

  /** Round to 1 decimal place to shrink JSON (~30% smaller numbers) */
  private r(n: number): number {
    return Math.round(n * 10) / 10;
  }

  /** Round to 2 decimal places for player positions (higher precision for replay) */
  private r2(n: number): number {
    return Math.round(n * 100) / 100;
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
        this.r2(s.pos.x), this.r2(s.pos.y), r(s.prevX), r(s.prevY),
        healthToNum(s.health), dirToNum(s.direction),
        s.isMoving ? 1 : 0, s.walking ? 1 : 0, r(s.animTime),
      ],
      s2: [
        this.r2(s2.pos.x), this.r2(s2.pos.y), r(s2.prevX), r(s2.prevY),
        healthToNum(s2.health), dirToNum(s2.direction),
        s2.isMoving ? 1 : 0, s2.walking ? 1 : 0, r(s2.animTime),
      ],
      k: [
        r(k.pos.x), r(k.pos.y), r(k.prevX), r(k.prevY),
        dirToNum(k.direction), k.isMoving ? 1 : 0, k.walking ? 1 : 0,
        r(k.stunTimer), r(k.attackCooldown), k.isCarrying ? 1 : 0, r(k.animTime),
      ],
      g: g.generators.map((gen) => [r(gen.progress), gen.completed ? 1 : 0, gen.beingRepaired ? 1 : 0, gen.regressing ? 1 : 0]),
      h: g.hooks.map((h) => [h.hooked ? 1 : 0, h.stage, r(h.stageTimer), h.canSelfUnhook ? 1 : 0, r(h.rescueProgress), r(h.selfUnhookProgress)]),
      p: g.pallets.map((p) => [p.dropped ? 1 : 0, p.isDestroyed ? 1 : 0, r(p.pos.x), r(p.pos.y), p.width, p.height]),
      gt: g.exitGates.map((gt) => [gt.powered ? 1 : 0, gt.isOpen ? 1 : 0, r(gt.openProgress)]),
      l: g.lockers.map((loc) => loc.occupant === s ? 1 : loc.occupant === s2 ? 2 : 0),
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
      ackTick: this.lastGuestTick[0],
      ackTick2: this.lastGuestTick[1],
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

    // ─── My Survivor: server reconciliation with input replay ───
    const serverX = myData[0];
    const serverY = myData[1];
    mySurvivor.health = numToHealth(myData[4]) as HealthState;

    if (mySurvivor.isIncapacitated) {
      // No local prediction when incapacitated — just snap to server
      mySurvivor.pos.x = serverX;
      mySurvivor.pos.y = serverY;
      mySurvivor.prevX = myData[2];
      mySurvivor.prevY = myData[3];
      mySurvivor.direction = numToDir(myData[5]) as Direction;
      mySurvivor.isMoving = myData[6] === 1;
      mySurvivor.walking = myData[7] === 1;
      this.predictionBuffer.length = 0;
      this.smoothOffsetX = 0;
      this.smoothOffsetY = 0;
    } else {
      // Save position before reconciliation for visual smoothing
      const beforeX = mySurvivor.pos.x;
      const beforeY = mySurvivor.pos.y;
      const beforePrevX = mySurvivor.prevX;
      const beforePrevY = mySurvivor.prevY;

      // Discard acknowledged prediction entries
      const ackTick = this.guestIndex === 0 ? state.ackTick : state.ackTick2;
      while (this.predictionBuffer.length > 0 && this.predictionBuffer[0].tick <= ackTick) {
        this.predictionBuffer.shift();
      }

      // Start from server-authoritative position and replay unacknowledged inputs
      mySurvivor.pos.x = serverX;
      mySurvivor.pos.y = serverY;

      let replayPrevX = serverX;
      let replayPrevY = serverY;
      for (const entry of this.predictionBuffer) {
        replayPrevX = mySurvivor.pos.x;
        replayPrevY = mySurvivor.pos.y;
        this.replayMove(mySurvivor, entry.dx, entry.dy, entry.walk);
      }

      // Measure correction after replay
      const jumpX = mySurvivor.pos.x - beforeX;
      const jumpY = mySurvivor.pos.y - beforeY;
      const jumpDist = Math.sqrt(jumpX * jumpX + jumpY * jumpY);

      if (jumpDist < 0.5) {
        // Negligible error: keep predicted position for perfect smoothness
        mySurvivor.pos.x = beforeX;
        mySurvivor.pos.y = beforeY;
        mySurvivor.prevX = beforePrevX;
        mySurvivor.prevY = beforePrevY;
      } else if (jumpDist < 50) {
        // Small correction: accept reconciled position, smooth visually
        mySurvivor.prevX = replayPrevX;
        mySurvivor.prevY = replayPrevY;
        this.smoothOffsetX -= jumpX;
        this.smoothOffsetY -= jumpY;
      } else {
        // Large correction (teleport/stun): snap immediately
        mySurvivor.prevX = replayPrevX;
        mySurvivor.prevY = replayPrevY;
        this.smoothOffsetX = 0;
        this.smoothOffsetY = 0;
      }
    }

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
        g.hooks[i].selfUnhookProgress = hd[5] ?? 0;
        // canSelfUnhook is a getter based on hooked survivor's selfUnhookUsed flag
        // Sync selfUnhookUsed: if host says canSelfUnhook=false but survivor is hooked, mark used
        if (g.hooks[i].hooked && hd[3] === 0) {
          g.hooks[i].hooked.selfUnhookUsed = true;
        }
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

    // Lockers
    state.l.forEach((occ, i) => {
      if (i < g.lockers.length) {
        g.lockers[i].occupant = occ === 1 ? s : occ === 2 ? s2 : null;
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

    // Skill check — guest runs cursor locally for responsive input.
    // Host only sends the trigger (zone info). Guest handles cursor + hit locally.
    const mySCData = this.guestIndex === 0 ? state.sc : state.sc2;
    const mySC = this.guestIndex === 0 ? g.skillCheck1 : g.skillCheck2;
    if (mySCData && mySCData.active && !mySC.active && !mySC.isShowingResult) {
      // Host triggered a new skill check — start it locally with the same zones
      mySC.active = true;
      mySC.cursor = 0; // Start from beginning, rotate locally
      mySC.targetStart = mySCData.ts;
      mySC.targetWidth = mySCData.te - mySCData.ts;
      mySC.greatStart = mySCData.gs;
      mySC.greatWidth = mySCData.ge - mySCData.gs;
    }
    // Don't overwrite active skill check or result display from host state —
    // cursor rotation and hit detection are fully local on guest.

    this.lastReceivedTick = state.tick;
  }

  private playSound(name: string): void {
    const fn = (audioManager as unknown as Record<string, unknown>)[name];
    if (typeof fn === 'function') fn.call(audioManager);
  }

  render(alpha: number): void {
    if (!this.isHost && (this.smoothOffsetX !== 0 || this.smoothOffsetY !== 0)) {
      const mySurvivor = this.guestIndex === 0 ? this.game.survivor : this.game.survivor2;
      // Temporarily apply visual offset for smooth rendering
      mySurvivor.pos.x += this.smoothOffsetX;
      mySurvivor.pos.y += this.smoothOffsetY;
      mySurvivor.prevX += this.smoothOffsetX;
      mySurvivor.prevY += this.smoothOffsetY;
      // Re-follow camera so the whole view shifts smoothly
      this.game.survivorCamera.follow({ x: mySurvivor.centerX, y: mySurvivor.centerY });

      this.game.render(alpha);

      // Restore game-logic positions
      mySurvivor.pos.x -= this.smoothOffsetX;
      mySurvivor.pos.y -= this.smoothOffsetY;
      mySurvivor.prevX -= this.smoothOffsetX;
      mySurvivor.prevY -= this.smoothOffsetY;
    } else {
      this.game.render(alpha);
    }
  }

  get phase(): GamePhase {
    return this.game.phase;
  }

  destroy(): void {
    this.net.removeListener(this.onMessage);
  }
}
