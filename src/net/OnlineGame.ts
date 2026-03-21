/**
 * Online multiplayer client — dedicated server mode.
 *
 * All players (killer + survivors) are equal clients:
 * - Send input to server
 * - Receive authoritative state
 * - Client-side prediction for own character
 * - Interpolation for other characters
 */

import { Game } from '../core/Game';
import { Input } from '../core/Input';
import { NetworkClient, ServerMessage } from './NetworkClient';
import {
  NetState, NetInput, NetMessage, NetSkillCheckResult, OnlineRole,
  numToDir, numToHealth,
} from './protocol';
import { HealthState, GamePhase, Direction, type MenuSelection } from '../types';
import { TrapAbility } from '../abilities/TrapAbility';
import { ThrowAxe } from '../abilities/ThrowAxe';
import { Trap } from '../entities/Trap';
import { Axe } from '../entities/Axe';
import { audioManager } from '../audio/AudioManager';
import { TICK_DURATION } from '../constants';

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
  /** This client's role */
  private myRole: OnlineRole;

  // ─── Client-side prediction & interpolation ───
  private lastLocalInput = { dx: 0, dy: 0, walk: false };
  private localTick = 0;
  private predictionBuffer: PredictionEntry[] = [];
  private readonly MAX_PREDICTION_BUFFER = 600; // 10s at 60Hz
  private smoothOffsetX = 0;
  private smoothOffsetY = 0;

  /** Interpolation buffers for remote characters */
  private interpBuffers: Map<string, Snapshot[]> = new Map();
  private interpTime = 0;
  private readonly INTERP_DELAY = 0.045; // 45ms

  /** Previous sent input for deduplication */
  private prevSentInput: NetInput = { ...EMPTY_INPUT };
  private inputSendTimer = 0;
  private readonly INPUT_SEND_INTERVAL = 1 / 30;

  constructor(
    canvas: HTMLCanvasElement,
    input: Input,
    selection: MenuSelection,
    net: NetworkClient,
    myRole: OnlineRole,
  ) {
    this.net = net;
    this.myRole = myRole;

    // Both server and client create Game with same selection (same seeds → same map)
    this.game = new Game(canvas, input, selection);

    // Set which character this player controls for camera/rendering
    if (myRole === 'survivor1') {
      this.game.localSurvivor = this.game.survivor;
    } else if (myRole === 'survivor2') {
      this.game.localSurvivor = this.game.survivor2;
    }

    // Initialize interpolation buffers for each character type
    this.interpBuffers.set('killer', []);
    this.interpBuffers.set('survivor1', []);
    this.interpBuffers.set('survivor2', []);

    // Listen for server messages
    this.onMessage = this.onMessage.bind(this);
    net.onMessage(this.onMessage);
  }

  private onMessage(msg: ServerMessage): void {
    if (msg.type === 'state') {
      this.applyState(msg as unknown as NetState);
    } else if (msg.type === 'sound') {
      this.playSound(msg.name);
    } else if (msg.type === 'relay' && msg.data) {
      // Legacy relay compat
      const data = msg.data as NetMessage;
      if (data.type === 'state') this.applyState(data);
      else if (data.type === 'sound') this.playSound(data.name);
    }
  }

  update(dt: number): void {
    this.interpTime += dt;

    // Decay visual smooth offset each tick
    this.smoothOffsetX *= 0.85;
    this.smoothOffsetY *= 0.85;
    if (Math.abs(this.smoothOffsetX) < 0.1) this.smoothOffsetX = 0;
    if (Math.abs(this.smoothOffsetY) < 0.1) this.smoothOffsetY = 0;

    if (this.game.phase !== GamePhase.Playing) return;

    // Client-side prediction for own character
    const isKiller = this.myRole === 'killer';

    if (isKiller) {
      // Killer prediction
      const k = this.game.killer;
      if (!k.isStunned) {
        const { dx, dy, walk } = this.lastLocalInput;
        this.localTick++;
        this.predictionBuffer.push({ tick: this.localTick, dx, dy, walk });
        if (this.predictionBuffer.length > this.MAX_PREDICTION_BUFFER) {
          this.predictionBuffer.splice(0, this.predictionBuffer.length - this.MAX_PREDICTION_BUFFER);
        }
        if (dx !== 0 || dy !== 0) {
          k.walking = walk;
          k.move(dx, dy, dt, this.game.map, (px, py, w, h) => this.palletCollision(px, py, w, h));
        } else {
          k.isMoving = false;
          k.prevX = k.pos.x;
          k.prevY = k.pos.y;
        }
      }
    } else {
      // Survivor prediction
      const mySurvivor = this.myRole === 'survivor1' ? this.game.survivor : this.game.survivor2;
      const inLocker = this.game.lockers.some((l) => l.occupant === mySurvivor);
      const isHooked = this.game.hooks.some((h) => h.hooked === mySurvivor);
      const canMove = !mySurvivor.isIncapacitated && mySurvivor.health !== HealthState.Dead
        && !inLocker && !isHooked && !mySurvivor.isBeingCarried;
      if (canMove) {
        const { dx, dy, walk } = this.lastLocalInput;
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
    }

    // Interpolate remote characters
    for (const [key, snapshots] of this.interpBuffers) {
      if (key === this.myRole) continue; // Don't interpolate own character
      const entity = this.getCharacterByRole(key as OnlineRole);
      if (entity) this.interpolateEntity(snapshots, entity);
    }

    // Update fog and camera
    const s = this.game.survivor;
    const s2 = this.game.survivor2;
    this.game.survivorFog.updateMultiple([
      { x: s.centerX, y: s.centerY },
      { x: s2.centerX, y: s2.centerY },
    ]);
    this.game.killerFog.update(this.game.killer.centerX, this.game.killer.centerY);

    // Camera follows this client's character
    if (isKiller) {
      this.game.killerCamera.follow({ x: this.game.killer.centerX, y: this.game.killer.centerY });
    } else {
      const mySurvivor = this.myRole === 'survivor1' ? this.game.survivor : this.game.survivor2;
      this.game.survivorCamera.follow({ x: mySurvivor.centerX, y: mySurvivor.centerY });
    }

    // Skill check runs LOCALLY for responsive input (survivors only)
    if (!isKiller) {
      const mySC = this.myRole === 'survivor1' ? this.game.skillCheck1 : this.game.skillCheck2;
      mySC.update(dt);
    }
  }

  /** Send local input to server */
  sendInput(input: Input, dt: number): void {
    const isKiller = this.myRole === 'killer';

    let dx = 0, dy = 0;
    if (input.isDown('KeyW')) dy -= 1;
    if (input.isDown('KeyS')) dy += 1;
    if (input.isDown('KeyA')) dx -= 1;
    if (input.isDown('KeyD')) dx += 1;

    this.lastLocalInput = { dx, dy, walk: input.isDown('ShiftLeft') };

    // Handle skill check Space press locally (survivors only)
    const spacePressed = input.wasPressed('Space');
    let spaceForServer = spacePressed;

    if (!isKiller) {
      const mySC = this.myRole === 'survivor1' ? this.game.skillCheck1 : this.game.skillCheck2;
      if (spacePressed && mySC.active) {
        const result = mySC.hit();
        switch (result) {
          case 'great': audioManager.playSkillCheckGreat(); break;
          case 'good': audioManager.playSkillCheckGood(); break;
          case 'miss': audioManager.playSkillCheckMiss(); break;
        }
        this.net.sendDirect({ type: 'sc_result', result } as NetSkillCheckResult);
        spaceForServer = false;
      }
    }

    const msg: NetInput = {
      type: 'input',
      role: this.myRole,
      dx, dy,
      interact: input.wasPressed('KeyE'),
      interactHeld: input.isDown('KeyE'),
      ability: input.wasPressed('KeyQ'),
      walk: input.isDown('ShiftLeft'),
      space: spaceForServer,
      tick: this.localTick,
    };

    const hasOneShot = msg.interact || msg.ability || msg.space;
    this.inputSendTimer += dt;
    const inputChanged = msg.dx !== this.prevSentInput.dx || msg.dy !== this.prevSentInput.dy
      || msg.interactHeld !== this.prevSentInput.interactHeld || msg.walk !== this.prevSentInput.walk;

    if (hasOneShot || inputChanged || this.inputSendTimer >= this.INPUT_SEND_INTERVAL) {
      this.inputSendTimer = 0;
      this.prevSentInput = msg;
      this.net.sendDirect(msg);
    }
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

    // ─── My character: server reconciliation with input replay ───
    this.reconcileMyCharacter(state);

    // ─── Remote characters: buffer for interpolation ───
    this.bufferRemoteCharacters(state);

    // Killer carrying state — k[9]: 0=none, 1=survivor1, 2=survivor2
    if (state.k[9] === 1) {
      k.carrying = s;
    } else if (state.k[9] === 2) {
      k.carrying = s2;
    } else {
      k.carrying = null;
    }
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

    // Hooks — hd[0]: 0=empty, 1=survivor1, 2=survivor2
    state.h.forEach((hd, i) => {
      if (i < g.hooks.length) {
        if (hd[0] === 1) {
          g.hooks[i].hooked = s;
        } else if (hd[0] === 2) {
          g.hooks[i].hooked = s2;
        } else {
          g.hooks[i].hooked = null;
        }
        g.hooks[i].stage = hd[1];
        g.hooks[i].stageTimer = hd[2];
        g.hooks[i].rescueProgress = hd[4] ?? 0;
        g.hooks[i].selfUnhookProgress = hd[5] ?? 0;
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

    // Skill check — client runs cursor locally for responsive input
    if (this.myRole !== 'killer') {
      const mySCData = this.myRole === 'survivor1' ? state.sc : state.sc2;
      const mySC = this.myRole === 'survivor1' ? g.skillCheck1 : g.skillCheck2;
      if (mySCData && mySCData.active && !mySC.active && !mySC.isShowingResult) {
        mySC.active = true;
        mySC.cursor = 0;
        mySC.targetStart = mySCData.ts;
        mySC.targetWidth = mySCData.te - mySCData.ts;
        mySC.greatStart = mySCData.gs;
        mySC.greatWidth = mySCData.ge - mySCData.gs;
      }
    }

    // Ability cooldowns
    if (g.survivorAbility) {
      g.survivorAbility.cooldownRemaining = state.sa[0];
      if (state.sa[1] === 1 && !g.survivorAbility.isActive) g.survivorAbility.activate();
    }
    if (g.survivor2Ability) {
      g.survivor2Ability.cooldownRemaining = state.s2a[0];
      if (state.s2a[1] === 1 && !g.survivor2Ability.isActive) g.survivor2Ability.activate();
    }
    if (g.killerAbility) {
      g.killerAbility.cooldownRemaining = state.ka[0];
      if (state.ka[1] === 1 && !g.killerAbility.isActive) g.killerAbility.activate();
    }

    // Killer timers
    k.stunTimer = state.k[7];
    k.attackCooldown = state.k[8];
  }

  private reconcileMyCharacter(state: NetState): void {
    const isKiller = this.myRole === 'killer';

    if (isKiller) {
      // Killer reconciliation
      const k = this.game.killer;
      const serverX = state.k[0];
      const serverY = state.k[1];
      const ackTick = state.ackTickK;

      if (k.isStunned) {
        k.pos.x = serverX;
        k.pos.y = serverY;
        k.prevX = state.k[2];
        k.prevY = state.k[3];
        k.direction = numToDir(state.k[4]) as Direction;
        k.isMoving = state.k[5] === 1;
        k.walking = state.k[6] === 1;
        this.predictionBuffer.length = 0;
        this.smoothOffsetX = 0;
        this.smoothOffsetY = 0;
        return;
      }

      this.doReconciliation(k, serverX, serverY, ackTick, true);
    } else {
      // Survivor reconciliation
      const mySurvivor = this.myRole === 'survivor1' ? this.game.survivor : this.game.survivor2;
      const myData = this.myRole === 'survivor1' ? state.s : state.s2;
      const serverX = myData[0];
      const serverY = myData[1];
      const ackTick = this.myRole === 'survivor1' ? state.ackTick : state.ackTick2;
      mySurvivor.health = numToHealth(myData[4]) as HealthState;

      // Check if survivor cannot move: incapacitated, hooked, carried, or in locker
      const myLockerVal = this.myRole === 'survivor1' ? 1 : 2;
      const isInLocker = state.l.some((v) => v === myLockerVal);
      const myCarryVal = this.myRole === 'survivor1' ? 1 : 2;
      const isCarried = state.k[9] === myCarryVal;
      // Check if any hook holds my survivor (hd[0]: 1=s1, 2=s2)
      const myHookVal = this.myRole === 'survivor1' ? 1 : 2;
      const isHooked = state.h.some((hd) => hd[0] === myHookVal);

      if (mySurvivor.isIncapacitated || isHooked || isCarried || isInLocker) {
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
        return;
      }

      this.doReconciliation(mySurvivor, serverX, serverY, ackTick, false);
    }
  }

  private doReconciliation(
    entity: { pos: { x: number; y: number }; prevX: number; prevY: number; width: number; height: number; speed: number },
    serverX: number, serverY: number, ackTick: number,
    isKiller: boolean,
  ): void {
    const beforeX = entity.pos.x;
    const beforeY = entity.pos.y;
    const beforePrevX = entity.prevX;
    const beforePrevY = entity.prevY;

    // Discard acknowledged prediction entries
    while (this.predictionBuffer.length > 0 && this.predictionBuffer[0].tick <= ackTick) {
      this.predictionBuffer.shift();
    }

    // Start from server-authoritative position and replay unacknowledged inputs
    entity.pos.x = serverX;
    entity.pos.y = serverY;

    let replayPrevX = serverX;
    let replayPrevY = serverY;
    for (const entry of this.predictionBuffer) {
      replayPrevX = entity.pos.x;
      replayPrevY = entity.pos.y;
      this.replayMove(entity, entry.dx, entry.dy, entry.walk, isKiller);
    }

    // Measure correction
    const jumpX = entity.pos.x - beforeX;
    const jumpY = entity.pos.y - beforeY;
    const jumpDist = Math.sqrt(jumpX * jumpX + jumpY * jumpY);

    if (jumpDist < 0.5) {
      entity.pos.x = beforeX;
      entity.pos.y = beforeY;
      entity.prevX = beforePrevX;
      entity.prevY = beforePrevY;
    } else if (jumpDist < 50) {
      entity.prevX = replayPrevX;
      entity.prevY = replayPrevY;
      this.smoothOffsetX -= jumpX;
      this.smoothOffsetY -= jumpY;
    } else {
      entity.prevX = replayPrevX;
      entity.prevY = replayPrevY;
      this.smoothOffsetX = 0;
      this.smoothOffsetY = 0;
    }
  }

  private bufferRemoteCharacters(state: NetState): void {
    const now = this.interpTime;

    // Survivor 1
    if (this.myRole !== 'survivor1') {
      const sd = state.s;
      this.interpBuffers.get('survivor1')!.push({
        time: now, x: sd[0], y: sd[1], prevX: sd[2], prevY: sd[3],
        direction: sd[5], isMoving: sd[6] === 1, walking: sd[7] === 1, animTime: sd[8],
      });
      this.game.survivor.health = numToHealth(sd[4]) as HealthState;
    }

    // Survivor 2
    if (this.myRole !== 'survivor2') {
      const sd = state.s2;
      this.interpBuffers.get('survivor2')!.push({
        time: now, x: sd[0], y: sd[1], prevX: sd[2], prevY: sd[3],
        direction: sd[5], isMoving: sd[6] === 1, walking: sd[7] === 1, animTime: sd[8],
      });
      this.game.survivor2.health = numToHealth(sd[4]) as HealthState;
    }

    // Killer
    if (this.myRole !== 'killer') {
      const kd = state.k;
      this.interpBuffers.get('killer')!.push({
        time: now, x: kd[0], y: kd[1], prevX: kd[2], prevY: kd[3],
        direction: kd[4], isMoving: kd[5] === 1, walking: kd[6] === 1, animTime: kd[10],
      });
    }
  }

  private replayMove(
    entity: { pos: { x: number; y: number }; width: number; height: number; speed: number },
    dx: number, dy: number, walk: boolean, isKiller: boolean,
  ): void {
    if (dx === 0 && dy === 0) return;
    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len;
    dy /= len;
    const speed = walk ? entity.speed * 0.45 : entity.speed;
    const moveX = dx * speed * TICK_DURATION;
    const moveY = dy * speed * TICK_DURATION;

    const nextX = entity.pos.x + moveX;
    const collidesX = this.game.map.collidesRect(nextX, entity.pos.y, entity.width, entity.height)
      || (isKiller && this.palletCollision(nextX, entity.pos.y, entity.width, entity.height));
    if (!collidesX) entity.pos.x = nextX;

    const nextY = entity.pos.y + moveY;
    const collidesY = this.game.map.collidesRect(entity.pos.x, nextY, entity.width, entity.height)
      || (isKiller && this.palletCollision(entity.pos.x, nextY, entity.width, entity.height));
    if (!collidesY) entity.pos.y = nextY;
  }

  private palletCollision(px: number, py: number, w: number, h: number): boolean {
    for (const pallet of this.game.pallets) {
      if (!pallet.dropped || pallet.isDestroyed) continue;
      if (px < pallet.pos.x + pallet.width &&
          px + w > pallet.pos.x &&
          py < pallet.pos.y + pallet.height &&
          py + h > pallet.pos.y) {
        return true;
      }
    }
    return false;
  }

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

  private getMyCharacter(): { pos: { x: number; y: number }; prevX: number; prevY: number } {
    if (this.myRole === 'killer') return this.game.killer;
    if (this.myRole === 'survivor2') return this.game.survivor2;
    return this.game.survivor;
  }

  private getCharacterByRole(role: OnlineRole): { pos: { x: number; y: number }; prevX: number; prevY: number; isMoving: boolean; walking: boolean; direction: Direction; animTime: number } | null {
    if (role === 'killer') return this.game.killer;
    if (role === 'survivor1') return this.game.survivor;
    if (role === 'survivor2') return this.game.survivor2;
    return null;
  }

  private playSound(name: string): void {
    const fn = (audioManager as unknown as Record<string, unknown>)[name];
    if (typeof fn === 'function') fn.call(audioManager);
  }

  render(alpha: number): void {
    const myChar = this.getMyCharacter();
    if (this.smoothOffsetX !== 0 || this.smoothOffsetY !== 0) {
      // Temporarily apply visual offset for smooth rendering
      myChar.pos.x += this.smoothOffsetX;
      myChar.pos.y += this.smoothOffsetY;
      myChar.prevX += this.smoothOffsetX;
      myChar.prevY += this.smoothOffsetY;

      // Re-follow camera
      if (this.myRole === 'killer') {
        this.game.killerCamera.follow({ x: this.game.killer.centerX, y: this.game.killer.centerY });
      } else {
        const mySurvivor = this.myRole === 'survivor1' ? this.game.survivor : this.game.survivor2;
        this.game.survivorCamera.follow({ x: mySurvivor.centerX, y: mySurvivor.centerY });
      }

      this.game.render(alpha);

      // Restore game-logic positions
      myChar.pos.x -= this.smoothOffsetX;
      myChar.pos.y -= this.smoothOffsetY;
      myChar.prevX -= this.smoothOffsetX;
      myChar.prevY -= this.smoothOffsetY;
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
