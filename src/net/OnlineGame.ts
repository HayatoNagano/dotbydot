/**
 * Online multiplayer wrapper around Game.
 *
 * Host: runs Game normally, serializes state and sends to guest.
 * Guest: client-side prediction for own character (killer),
 *        interpolation buffer for opponent (survivor), server reconciliation.
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
import { TICK_DURATION, KILLER_BASE_SPEED } from '../constants';

const STATE_SEND_INTERVAL = 1 / 30; // 30Hz state updates (doubled from 15Hz)

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

export class OnlineGame {
  game: Game;
  private net: NetworkClient;
  private isHost: boolean;
  private stateSendTimer = 0;
  private tick = 0;

  // Guest state: remote input from guest (used by host)
  private guestInput: NetInput = {
    type: 'input', dx: 0, dy: 0,
    interact: false, interactHeld: false, ability: false, walk: false, space: false,
  };
  // Track pressed state for guest (convert held→pressed)
  private guestPrevInteract = false;
  private guestPrevAbility = false;

  // ─── Guest-side prediction & interpolation ───
  /** Last input sent by guest (for local prediction) */
  private lastLocalInput = { dx: 0, dy: 0, walk: false };
  /** Interpolation buffer for survivor (opponent) on guest side */
  private survivorSnapshots: Snapshot[] = [];
  /** Time tracking for interpolation */
  private interpTime = 0;
  /** Interpolation delay (renders slightly in the past for smoothness) */
  private readonly INTERP_DELAY = 0.1; // 100ms delay = ~3 snapshots at 30Hz
  /** Blend factor for server reconciliation (0=snap, 1=ignore server) */
  private readonly RECONCILE_BLEND = 0.3; // blend 30% toward server each update
  /** Last state tick received */
  private lastReceivedTick = 0;

  constructor(
    canvas: HTMLCanvasElement,
    input: Input,
    selection: MenuSelection,
    net: NetworkClient,
    isHost: boolean,
  ) {
    this.net = net;
    this.isHost = isHost;

    // Both host and guest create Game with same selection (same seeds → same map)
    this.game = new Game(canvas, input, selection);

    // Listen for relay messages
    this.onMessage = this.onMessage.bind(this);
    net.onMessage(this.onMessage);

    // If host, send game_start to guest
    if (isHost) {
      net.relay({
        type: 'game_start',
        seed: this.game.map.seed,
        survivorDef: selection.survivorDef.abilityName,
        killerDef: selection.killerDef.abilityName,
        survivorColor: selection.survivorDef.color,
        killerColor: selection.killerDef.color,
      });
    }
  }

  private onMessage(msg: ServerMessage): void {
    if (msg.type !== 'relay') return;
    const data = msg.data as NetMessage;

    if (this.isHost) {
      // Host receives guest inputs
      if (data.type === 'input') {
        this.guestInput = data;
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
    // Inject guest inputs into the game
    // Guest is always the killer (host = survivor, guest = killer)
    this.injectGuestInputs();

    // Run the game simulation
    this.game.update(dt);

    // Periodically send state to guest
    this.stateSendTimer += dt;
    if (this.stateSendTimer >= STATE_SEND_INTERVAL) {
      this.stateSendTimer = 0;
      this.tick++;
      this.sendState();
    }
  }

  /** Guest-side update: predict own character movement locally */
  private updateGuest(dt: number): void {
    this.interpTime += dt;

    const k = this.game.killer;

    // Skip prediction if stunned or game not playing
    if (k.stunTimer > 0 || this.game.phase !== GamePhase.Playing) return;

    // Client-side prediction: move killer locally based on last input
    const { dx, dy, walk } = this.lastLocalInput;
    if (dx !== 0 || dy !== 0) {
      k.walking = walk;
      k.move(dx, dy, dt, this.game.map);

      // Update fog and camera to follow predicted position
      this.game.killerFog.update(k.centerX, k.centerY);
      this.game.killerCamera.follow({ x: k.centerX, y: k.centerY });
    } else {
      // Sync prev when idle
      k.prevX = k.pos.x;
      k.prevY = k.pos.y;
    }

    // Interpolate survivor position from buffer
    this.interpolateSurvivor();
  }

  /** Interpolate survivor between buffered snapshots */
  private interpolateSurvivor(): void {
    const snapshots = this.survivorSnapshots;
    if (snapshots.length < 2) return;

    const s = this.game.survivor;
    // Render time is slightly in the past
    const renderTime = this.interpTime - this.INTERP_DELAY;

    // Find the two snapshots to interpolate between
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

      s.prevX = s.pos.x;
      s.prevY = s.pos.y;
      s.pos.x = from.x + (to.x - from.x) * t;
      s.pos.y = from.y + (to.y - from.y) * t;
      s.isMoving = to.isMoving;
      s.walking = to.walking;
      s.direction = numToDir(to.direction) as Direction;
      s.animTime = from.animTime + (to.animTime - from.animTime) * t;
    } else if (snapshots.length > 0) {
      // Extrapolate from last snapshot
      const last = snapshots[snapshots.length - 1];
      s.direction = numToDir(last.direction) as Direction;
      s.isMoving = last.isMoving;
      s.walking = last.walking;
    }

    // Prune old snapshots (keep last 1 second worth)
    while (snapshots.length > 2 && snapshots[0].time < renderTime - 1.0) {
      snapshots.shift();
    }

    // Update survivor fog and camera
    this.game.survivorFog.update(s.centerX, s.centerY);
    this.game.survivorCamera.follow({ x: s.centerX, y: s.centerY });
  }

  private injectGuestInputs(): void {
    const g = this.guestInput;
    const input = this.game.input;

    // We need to inject inputs. The Game reads from Input directly.
    // Override the relevant keys for the guest's role.
    // Since host=survivor, guest=killer:
    // Killer uses Arrow keys in 2P mode, so we override those.
    input.injectKey('ArrowUp', g.dy < -0.1);
    input.injectKey('ArrowDown', g.dy > 0.1);
    input.injectKey('ArrowLeft', g.dx < -0.1);
    input.injectKey('ArrowRight', g.dx > 0.1);
    input.injectKey('ShiftRight', g.walk);

    // Interact (Period in 2P killer mode)
    // Use interactHeld for isDown state (needed for generator kick hold)
    // Detect press edge from interactHeld transition (false→true)
    input.injectKey('Period', g.interactHeld);
    const interactPressed = g.interactHeld && !this.guestPrevInteract;
    if (interactPressed) input.injectPressed('Period');
    this.guestPrevInteract = g.interactHeld;

    // Ability (Comma in 2P killer mode)
    const abilityPressed = g.ability && !this.guestPrevAbility;
    if (abilityPressed) input.injectPressed('Comma');
    this.guestPrevAbility = g.ability;
  }

  /** Send local input to host (guest calls this) */
  sendInput(input: Input): void {
    if (this.isHost) return;

    // Guest plays as killer, reads WASD
    let dx = 0, dy = 0;
    if (input.isDown('KeyW')) dy -= 1;
    if (input.isDown('KeyS')) dy += 1;
    if (input.isDown('KeyA')) dx -= 1;
    if (input.isDown('KeyD')) dx += 1;

    // Store for local prediction
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
    this.net.relay(msg);
  }

  private sendState(): void {
    const g = this.game;
    const s = g.survivor;
    const k = g.killer;

    const state: NetState = {
      type: 'state',
      tick: this.tick,
      phase: g.phase,
      gensCompleted: g.generatorsCompleted,
      gatesPowered: g.gatesPowered,
      inChase: g.inChase,
      terrorIntensity: 0, // computed on guest side
      sId: s.characterId,
      kId: k.characterId,
      s: [
        s.pos.x, s.pos.y, s.prevX, s.prevY,
        healthToNum(s.health), dirToNum(s.direction),
        s.isMoving ? 1 : 0, s.walking ? 1 : 0, s.animTime,
      ],
      k: [
        k.pos.x, k.pos.y, k.prevX, k.prevY,
        dirToNum(k.direction), k.isMoving ? 1 : 0, k.walking ? 1 : 0,
        k.stunTimer, k.attackCooldown, k.isCarrying ? 1 : 0, k.animTime,
      ],
      g: g.generators.map((gen) => [gen.progress, gen.completed ? 1 : 0, gen.beingRepaired ? 1 : 0, gen.regressing ? 1 : 0]),
      h: g.hooks.map((h) => [h.hooked ? 1 : 0, h.stage, h.stageTimer, h.canSelfUnhook ? 1 : 0]),
      p: g.pallets.map((p) => [p.dropped ? 1 : 0, p.isDestroyed ? 1 : 0, p.pos.x, p.pos.y, p.width, p.height]),
      gt: g.exitGates.map((gt) => [gt.powered ? 1 : 0, gt.isOpen ? 1 : 0, gt.openProgress]),
      tr: (g.killerAbility instanceof TrapAbility ? g.killerAbility.traps : [])
        .map((t) => [t.pos.x, t.pos.y, t.armed ? 1 : 0, t.trapped ? 1 : 0]),
      ax: (g.killerAbility instanceof ThrowAxe ? g.killerAbility.axes : [])
        .filter((a) => a.alive)
        .map((a) => [a.pos.x, a.pos.y, a.alive ? 1 : 0]),
      sm: g.scratchMarks.allMarks.slice(-30).map((m) => [m.x, m.y, m.age]),
      sc: g.skillCheck.active ? {
        active: true,
        angle: g.skillCheck.cursor,
        ts: g.skillCheck.targetStart,
        te: g.skillCheck.targetStart + g.skillCheck.targetWidth,
        gs: g.skillCheck.greatStart,
        ge: g.skillCheck.greatStart + g.skillCheck.greatWidth,
      } : null,
      sa: [g.survivorAbility?.cooldownRemaining ?? 0, g.survivorAbility?.isActive ? 1 : 0],
      ka: [g.killerAbility?.cooldownRemaining ?? 0, g.killerAbility?.isActive ? 1 : 0],
    };

    this.net.relay(state);
  }

  private applyState(state: NetState): void {
    const g = this.game;
    const s = g.survivor;
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
    if (state.kId) k.characterId = state.kId;

    // ─── Survivor: buffer for interpolation ───
    const sd = state.s;
    this.survivorSnapshots.push({
      time: this.interpTime,
      x: sd[0],
      y: sd[1],
      prevX: sd[2],
      prevY: sd[3],
      direction: sd[5],
      isMoving: sd[6] === 1,
      walking: sd[7] === 1,
      animTime: sd[8],
    });
    // Apply non-positional survivor state immediately
    s.health = numToHealth(sd[4]) as HealthState;

    // ─── Killer: server reconciliation (blend toward authoritative position) ───
    const kd = state.k;
    const serverX = kd[0];
    const serverY = kd[1];

    // Blend current predicted position toward server position
    const blend = this.RECONCILE_BLEND;
    const errorX = serverX - k.pos.x;
    const errorY = serverY - k.pos.y;
    const errorDist = Math.sqrt(errorX * errorX + errorY * errorY);

    if (errorDist > 100) {
      // Large error: snap to server position (teleport/major desync)
      k.pos.x = serverX;
      k.pos.y = serverY;
      k.prevX = kd[2];
      k.prevY = kd[3];
    } else if (errorDist > 2) {
      // Small-medium error: blend toward server
      k.pos.x += errorX * blend;
      k.pos.y += errorY * blend;
    }
    // If error <= 2px, don't correct (prediction is close enough)

    k.direction = numToDir(kd[4]) as Direction;
    k.isMoving = kd[5] === 1;
    k.walking = kd[6] === 1;
    k.stunTimer = kd[7];
    k.attackCooldown = kd[8];
    k.carrying = kd[9] === 1 ? s : null;
    k.animTime = kd[10];

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
        g.hooks[i].hooked = hd[0] === 1 ? s : null;
        g.hooks[i].stage = hd[1];
        g.hooks[i].stageTimer = hd[2];
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

    // Traps — sync trapAbility.traps array from state
    const trapAbility = g.killerAbility instanceof TrapAbility ? g.killerAbility as TrapAbility : null;
    if (trapAbility) {
      // Resize traps array to match state
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

    // Axes — sync throwAxe.axes array from state
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

    // Fog update for the guest's character (killer)
    g.killerFog.update(k.centerX, k.centerY);
    g.killerCamera.follow({ x: k.centerX, y: k.centerY });

    // Also update survivor fog for rendering consistency
    g.survivorFog.update(s.centerX, s.centerY);
    g.survivorCamera.follow({ x: s.centerX, y: s.centerY });

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
