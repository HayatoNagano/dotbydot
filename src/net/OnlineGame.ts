/**
 * Online multiplayer wrapper around Game.
 *
 * Host: runs Game normally, serializes state and sends to guest.
 * Guest: receives state, applies to local Game (same seed/map), renders only.
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
import { audioManager } from '../audio/AudioManager';

const STATE_SEND_INTERVAL = 1 / 15; // 15Hz state updates

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
  private guestPrevSpace = false;

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
    }
    // Guest doesn't call game.update(); it applies received state
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
    const interactPressed = g.interact && !this.guestPrevInteract;
    input.injectKey('Period', g.interact);
    if (interactPressed) input.injectPressed('Period');
    this.guestPrevInteract = g.interact;

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
      g: g.generators.map((gen) => [gen.progress, gen.completed ? 1 : 0, gen.beingRepaired ? 1 : 0]),
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

    // Survivor
    const sd = state.s;
    s.pos.x = sd[0]; s.pos.y = sd[1];
    s.prevX = sd[2]; s.prevY = sd[3];
    s.health = numToHealth(sd[4]) as HealthState;
    s.direction = numToDir(sd[5]) as Direction;
    s.isMoving = sd[6] === 1;
    s.walking = sd[7] === 1;
    s.animTime = sd[8];

    // Killer
    const kd = state.k;
    k.pos.x = kd[0]; k.pos.y = kd[1];
    k.prevX = kd[2]; k.prevY = kd[3];
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

    // Fog update for the guest's character (killer)
    g.killerFog.update(k.centerX, k.centerY);
    g.killerCamera.follow({ x: k.centerX, y: k.centerY });

    // Also update survivor fog for rendering consistency
    g.survivorFog.update(s.centerX, s.centerY);
    g.survivorCamera.follow({ x: s.centerX, y: s.centerY });
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
