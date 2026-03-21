/**
 * Extracts game state serialization into a pure function.
 * Used by both the dedicated server (ServerRoom) and legacy host mode.
 */

import { Game } from '../core/Game';
import { NetState } from './protocol';
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
 * @param ackTicks [survivor1AckTick, survivor2AckTick, killerAckTick]
 * @param sendScratchMarks Whether to include scratch marks this tick
 */
export function serializeGameState(
  game: Game,
  tick: number,
  ackTicks: [number, number, number],
  sendScratchMarks: boolean,
): NetState {
  const s = game.survivor;
  const s2 = game.survivor2;
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
    k: [
      r2(k.pos.x), r2(k.pos.y), r(k.prevX), r(k.prevY),
      dirToNum(k.direction), k.isMoving ? 1 : 0, k.walking ? 1 : 0,
      r(k.stunTimer), r(k.attackCooldown), k.isCarrying ? 1 : 0, r(k.animTime),
    ],
    g: game.generators.map((gen) => [r(gen.progress), gen.completed ? 1 : 0, gen.beingRepaired ? 1 : 0, gen.regressing ? 1 : 0]),
    h: game.hooks.map((h) => [h.hooked ? 1 : 0, h.stage, r(h.stageTimer), h.canSelfUnhook ? 1 : 0, r(h.rescueProgress), r(h.selfUnhookProgress)]),
    p: game.pallets.map((p) => [p.dropped ? 1 : 0, p.isDestroyed ? 1 : 0, r(p.pos.x), r(p.pos.y), p.width, p.height]),
    gt: game.exitGates.map((gt) => [gt.powered ? 1 : 0, gt.isOpen ? 1 : 0, r(gt.openProgress)]),
    l: game.lockers.map((loc) => loc.occupant === s ? 1 : loc.occupant === s2 ? 2 : 0),
    tr: (game.killerAbility instanceof TrapAbility ? (game.killerAbility as TrapAbility).traps : [])
      .map((t) => [r(t.pos.x), r(t.pos.y), t.armed ? 1 : 0, t.trapped ? 1 : 0]),
    ax: (game.killerAbility instanceof ThrowAxe ? (game.killerAbility as ThrowAxe).axes : [])
      .filter((a) => a.alive)
      .map((a) => [r(a.pos.x), r(a.pos.y), a.alive ? 1 : 0]),
    sm: sendScratchMarks
      ? game.scratchMarks.allMarks.slice(-20).map((m) => [r(m.x), r(m.y), r(m.age)])
      : [],
    sc: serializeSkillCheck(game.skillCheck1),
    sc2: serializeSkillCheck(game.skillCheck2),
    sa: [r(game.survivorAbility?.cooldownRemaining ?? 0), game.survivorAbility?.isActive ? 1 : 0],
    s2a: [r(game.survivor2Ability?.cooldownRemaining ?? 0), game.survivor2Ability?.isActive ? 1 : 0],
    ka: [r(game.killerAbility?.cooldownRemaining ?? 0), game.killerAbility?.isActive ? 1 : 0],
    ackTick: ackTicks[0],
    ackTick2: ackTicks[1],
    ackTickK: ackTicks[2],
  };

  return state;
}
