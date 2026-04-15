/**
 * Extracts game state serialization into a pure function.
 * Used by both the dedicated server (ServerRoom) and legacy host mode.
 */

import { Game } from '../core/Game';
import { NetState, NetDeltaState, DELTA_MASK } from './protocol';
import { healthToNum, dirToNum } from './protocol';
import { SkillCheck } from '../ui/SkillCheck';
import { TrapAbility } from '../abilities/TrapAbility';
import { ThrowAxe } from '../abilities/ThrowAxe';

/** Round to 1 decimal place (compact JSON) */
function r(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Round to 2 decimal places (higher precision for player positions) */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function serializeSkillCheck(sc: SkillCheck): NetState['sc'] {
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

/**
 * Serialize the full game state into a compact NetState message.
 *
 * @param game The game instance
 * @param tick Server tick counter
 * @param ackTicks [survivor1AckTick, survivor2AckTick, survivor3AckTick, killerAckTick]
 * @param sendScratchMarks Whether to include scratch marks this tick
 */
export function serializeGameState(
  game: Game,
  tick: number,
  ackTicks: [number, number, number, number],
  sendScratchMarks: boolean,
): NetState {
  const s = game.survivor;
  const s2 = game.survivor2;
  const s3 = game.survivor3;
  const k = game.killer;

  const state: NetState = {
    type: 'state',
    tick,
    phase: game.phase,
    gensCompleted: game.generatorsCompleted,
    gatesPowered: game.gatesPowered,
    inChase: game.inChase,
    terrorIntensity: 0,
    sId: s.characterId,
    s2Id: s2.characterId,
    s3Id: s3.characterId,
    kId: k.characterId,
    s: [
      r2(s.pos.x), r2(s.pos.y), r(s.prevX), r(s.prevY),
      healthToNum(s.health), dirToNum(s.direction),
      s.isMoving ? 1 : 0, s.walking ? 1 : 0, r(s.animTime),
    ],
    s2: [
      r2(s2.pos.x), r2(s2.pos.y), r(s2.prevX), r(s2.prevY),
      healthToNum(s2.health), dirToNum(s2.direction),
      s2.isMoving ? 1 : 0, s2.walking ? 1 : 0, r(s2.animTime),
    ],
    s3: [
      r2(s3.pos.x), r2(s3.pos.y), r(s3.prevX), r(s3.prevY),
      healthToNum(s3.health), dirToNum(s3.direction),
      s3.isMoving ? 1 : 0, s3.walking ? 1 : 0, r(s3.animTime),
    ],
    k: [
      r2(k.pos.x), r2(k.pos.y), r(k.prevX), r(k.prevY),
      dirToNum(k.direction), k.isMoving ? 1 : 0, k.walking ? 1 : 0,
      r(k.stunTimer), r(k.attackCooldown), k.carrying === s ? 1 : k.carrying === s2 ? 2 : k.carrying === s3 ? 3 : 0, r(k.animTime),
    ],
    g: game.generators.map((gen) => [r(gen.progress), gen.completed ? 1 : 0, gen.beingRepaired ? 1 : 0, gen.regressing ? 1 : 0, r(gen.kickProgress)]),
    h: game.hooks.map((h) => [h.hooked === s ? 1 : h.hooked === s2 ? 2 : h.hooked === s3 ? 3 : 0, h.stage, r(h.stageTimer), h.canSelfUnhook ? 1 : 0, r(h.rescueProgress), r(h.selfUnhookProgress)]),
    p: game.pallets.map((p) => [p.dropped ? 1 : 0, p.isDestroyed ? 1 : 0, r(p.pos.x), r(p.pos.y), p.width, p.height]),
    gt: game.exitGates.map((gt) => [gt.powered ? 1 : 0, gt.isOpen ? 1 : 0, r(gt.openProgress)]),
    l: game.lockers.map((loc) => loc.occupant === s ? 1 : loc.occupant === s2 ? 2 : loc.occupant === s3 ? 3 : 0),
    cl: [k.cloakState, r(k.cloakProgress)],
    tr: (game.killerAbility instanceof TrapAbility ? (game.killerAbility as TrapAbility).traps : [])
      .map((t) => [r(t.pos.x), r(t.pos.y), t.armed ? 1 : 0, t.trapped === s ? 1 : t.trapped === s2 ? 2 : t.trapped === s3 ? 3 : 0]),
    ax: (game.killerAbility instanceof ThrowAxe ? (game.killerAbility as ThrowAxe).axes : [])
      .filter((a) => a.alive)
      .map((a) => [r(a.pos.x), r(a.pos.y), a.alive ? 1 : 0]),
    sm: sendScratchMarks
      ? game.scratchMarks.allMarks.slice(-20).map((m) => [r(m.x), r(m.y), r(m.age)])
      : [],
    sc: serializeSkillCheck(game.skillCheck1),
    sc2: serializeSkillCheck(game.skillCheck2),
    sc3: serializeSkillCheck(game.skillCheck3),
    sa: [r(game.survivorAbility?.cooldownRemaining ?? 0), game.survivorAbility?.isActive ? 1 : 0],
    s2a: [r(game.survivor2Ability?.cooldownRemaining ?? 0), game.survivor2Ability?.isActive ? 1 : 0],
    s3a: [r(game.survivor3Ability?.cooldownRemaining ?? 0), game.survivor3Ability?.isActive ? 1 : 0],
    ka: [r(game.killerAbility?.cooldownRemaining ?? 0), game.killerAbility?.isActive ? 1 : 0],
    ackTick: ackTicks[0],
    ackTick2: ackTicks[1],
    ackTick3: ackTicks[2],
    ackTickK: ackTicks[3],
  };

  return state;
}

/** Compare two number arrays element-by-element */
function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Compare two 2D number arrays */
function arrays2DEqual(a: number[][], b: number[][]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!arraysEqual(a[i], b[i])) return false;
  }
  return true;
}

/**
 * Compute a delta state by comparing current and previous full states.
 * Only changed field groups are included, identified by bitmask.
 */
export function computeDeltaState(
  current: NetState,
  previous: NetState,
): NetDeltaState {
  let mask = 0;
  const delta: NetDeltaState = {
    type: 'delta',
    tick: current.tick,
    mask: 0,
    ackTick: current.ackTick,
    ackTick2: current.ackTick2,
    ackTick3: current.ackTick3,
    ackTickK: current.ackTickK,
  };

  // Phase / global state
  if (current.phase !== previous.phase
    || current.gensCompleted !== previous.gensCompleted
    || current.gatesPowered !== previous.gatesPowered) {
    mask |= DELTA_MASK.PHASE;
    delta.phase = current.phase;
    delta.gensCompleted = current.gensCompleted;
    delta.gatesPowered = current.gatesPowered;
  }

  // Chase
  if (current.inChase !== previous.inChase) {
    mask |= DELTA_MASK.CHASE;
    delta.inChase = current.inChase;
  }

  // Character IDs (rarely change)
  if (current.sId !== previous.sId || current.s2Id !== previous.s2Id || current.s3Id !== previous.s3Id || current.kId !== previous.kId) {
    mask |= DELTA_MASK.IDS;
    delta.sId = current.sId;
    delta.s2Id = current.s2Id;
    delta.s3Id = current.s3Id;
    delta.kId = current.kId;
  }

  // Characters — always include (high priority, positions change constantly)
  if (!arraysEqual(current.s, previous.s)) {
    mask |= DELTA_MASK.S;
    delta.s = current.s;
  }
  if (!arraysEqual(current.s2, previous.s2)) {
    mask |= DELTA_MASK.S2;
    delta.s2 = current.s2;
  }
  if (!arraysEqual(current.s3, previous.s3)) {
    mask |= DELTA_MASK.S3;
    delta.s3 = current.s3;
  }
  if (!arraysEqual(current.k, previous.k)) {
    mask |= DELTA_MASK.K;
    delta.k = current.k;
  }

  // World objects
  if (!arrays2DEqual(current.g, previous.g)) {
    mask |= DELTA_MASK.G;
    delta.g = current.g;
  }
  if (!arrays2DEqual(current.h, previous.h)) {
    mask |= DELTA_MASK.H;
    delta.h = current.h;
  }
  if (!arrays2DEqual(current.p, previous.p)) {
    mask |= DELTA_MASK.P;
    delta.p = current.p;
  }
  if (!arrays2DEqual(current.gt, previous.gt)) {
    mask |= DELTA_MASK.GT;
    delta.gt = current.gt;
  }
  if (!arraysEqual(current.l, previous.l)) {
    mask |= DELTA_MASK.L;
    delta.l = current.l;
  }
  if (!arraysEqual(current.cl, previous.cl)) {
    mask |= DELTA_MASK.CL;
    delta.cl = current.cl;
  }
  if (!arrays2DEqual(current.tr, previous.tr)) {
    mask |= DELTA_MASK.TR;
    delta.tr = current.tr;
  }
  if (!arrays2DEqual(current.ax, previous.ax)) {
    mask |= DELTA_MASK.AX;
    delta.ax = current.ax;
  }

  // Scratch marks — include if non-empty
  if (current.sm.length > 0) {
    mask |= DELTA_MASK.SM;
    delta.sm = current.sm;
  }

  // Skill checks
  if (JSON.stringify(current.sc) !== JSON.stringify(previous.sc)) {
    mask |= DELTA_MASK.SC;
    delta.sc = current.sc;
  }
  if (JSON.stringify(current.sc2) !== JSON.stringify(previous.sc2)) {
    mask |= DELTA_MASK.SC2;
    delta.sc2 = current.sc2;
  }
  if (JSON.stringify(current.sc3) !== JSON.stringify(previous.sc3)) {
    mask |= DELTA_MASK.SC3;
    delta.sc3 = current.sc3;
  }

  // Abilities
  if (!arraysEqual(current.sa, previous.sa)) {
    mask |= DELTA_MASK.SA;
    delta.sa = current.sa;
  }
  if (!arraysEqual(current.s2a, previous.s2a)) {
    mask |= DELTA_MASK.S2A;
    delta.s2a = current.s2a;
  }
  if (!arraysEqual(current.s3a, previous.s3a)) {
    mask |= DELTA_MASK.S3A;
    delta.s3a = current.s3a;
  }
  if (!arraysEqual(current.ka, previous.ka)) {
    mask |= DELTA_MASK.KA;
    delta.ka = current.ka;
  }

  delta.mask = mask;
  return delta;
}
