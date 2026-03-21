import { AIController } from './AIController';
import { Killer } from '../entities/Killer';
import { Survivor } from '../entities/Survivor';
import { TileMap } from '../world/TileMap';
import { FogOfWar } from '../world/FogOfWar';
import { Pathfinding } from '../world/Pathfinding';
import { ScratchMarks } from '../systems/ScratchMarks';
import { Hook } from '../entities/Hook';
import { Generator } from '../entities/Generator';
import { TILE_SIZE } from '../constants';
import { HealthState } from '../types';

enum KillerState {
  Patrol,
  Investigate,
  Chase,
  Attack,
  Carry,
  Hook,
}

export class KillerAI implements AIController {
  private state: KillerState = KillerState.Patrol;
  private pathfinding: Pathfinding;
  private currentPath: { x: number; y: number }[] | null = null;
  private pathIndex = 0;
  private patrolTarget: { x: number; y: number } | null = null;
  private investigateTarget: { x: number; y: number } | null = null;
  private stateTimer = 0;
  private pathRecalcTimer = 0;
  /** Reaction delay — AI pauses briefly before acting after spotting survivor */
  private reactionTimer = 0;
  /** Whether currently in a reaction delay */
  private reacting = false;
  /** Currently targeted survivor */
  private targetSurvivor: Survivor | null = null;

  constructor(
    private killer: Killer,
    private survivors: Survivor[],
    private map: TileMap,
    private killerFog: FogOfWar,
    private scratchMarks: ScratchMarks,
    private hooks: Hook[],
    private generators: Generator[],
  ) {
    this.pathfinding = new Pathfinding(map);
  }

  /** Find the best survivor to target (nearest visible, prioritize dying) */
  private pickTarget(): { survivor: Survivor; canSee: boolean; dist: number } | null {
    let best: { survivor: Survivor; canSee: boolean; dist: number } | null = null;

    for (const s of this.survivors) {
      if (s.health === HealthState.Dead) continue;

      const survTX = Math.floor(s.centerX / TILE_SIZE);
      const survTY = Math.floor(s.centerY / TILE_SIZE);
      const canSee = this.killerFog.isVisible(survTX, survTY) && !s.isIncapacitated;
      const dist = Math.sqrt(
        (this.killer.centerX - s.centerX) ** 2 +
        (this.killer.centerY - s.centerY) ** 2,
      );

      // Prioritize: visible > not visible, dying > injured > healthy, closer > farther
      if (!best) {
        best = { survivor: s, canSee, dist };
        continue;
      }

      // Prefer visible survivors
      if (canSee && !best.canSee) {
        best = { survivor: s, canSee, dist };
      } else if (canSee === best.canSee) {
        // Prefer dying survivors (for pickup)
        const sDying = s.health === HealthState.Dying;
        const bDying = best.survivor.health === HealthState.Dying;
        if (sDying && !bDying) {
          best = { survivor: s, canSee, dist };
        } else if (sDying === bDying && dist < best.dist) {
          best = { survivor: s, canSee, dist };
        }
      }
    }

    return best;
  }

  update(dt: number): { dx: number; dy: number; interact: boolean; ability: boolean; walk: boolean } {
    this.stateTimer += dt;
    this.pathRecalcTimer += dt;

    // Handle reaction delay
    if (this.reacting) {
      this.reactionTimer -= dt;
      if (this.reactionTimer <= 0) {
        this.reacting = false;
      } else {
        // Stand still during reaction (looking around)
        return { dx: 0, dy: 0, interact: false, ability: false, walk: false };
      }
    }

    // Pick best target
    const target = this.pickTarget();
    if (target) {
      this.targetSurvivor = target.survivor;
    }

    const ts = this.targetSurvivor;
    if (!ts || ts.health === HealthState.Dead) {
      // No valid target, patrol
      this.targetSurvivor = null;
      this.state = KillerState.Patrol;
    }

    const killerTX = Math.floor(this.killer.centerX / TILE_SIZE);
    const killerTY = Math.floor(this.killer.centerY / TILE_SIZE);

    let survTX = 0, survTY = 0;
    let canSeeSurvivor = false;
    let distToSurvivor = Infinity;

    if (ts && ts.health !== HealthState.Dead) {
      survTX = Math.floor(ts.centerX / TILE_SIZE);
      survTY = Math.floor(ts.centerY / TILE_SIZE);
      canSeeSurvivor = this.killerFog.isVisible(survTX, survTY) && !ts.isIncapacitated;
      distToSurvivor = Math.sqrt(
        (this.killer.centerX - ts.centerX) ** 2 +
        (this.killer.centerY - ts.centerY) ** 2,
      );
    }

    let result = { dx: 0, dy: 0, interact: false, ability: false, walk: false };

    // State transitions
    switch (this.state) {
      case KillerState.Patrol:
        if (canSeeSurvivor) {
          this.state = KillerState.Chase;
          this.stateTimer = 0;
          // Reaction delay — doesn't instantly rush
          this.reacting = true;
          this.reactionTimer = 0.4 + Math.random() * 0.6; // 0.4-1.0s delay
          this.currentPath = null;
        } else {
          // Check for scratch marks (less frequently)
          if (this.stateTimer > 2) {
            const recentMark = this.findRecentScratchMark();
            if (recentMark) {
              this.investigateTarget = { x: recentMark.x, y: recentMark.y };
              this.state = KillerState.Investigate;
              this.stateTimer = 0;
            }
          }
        }
        break;

      case KillerState.Investigate:
        if (canSeeSurvivor) {
          this.state = KillerState.Chase;
          this.stateTimer = 0;
          this.reacting = true;
          this.reactionTimer = 0.3 + Math.random() * 0.4;
          this.currentPath = null;
        } else if (this.stateTimer > 10) {
          this.state = KillerState.Patrol;
          this.stateTimer = 0;
          this.patrolTarget = null;
        }
        break;

      case KillerState.Chase:
        if (!canSeeSurvivor && this.stateTimer > 6) {
          this.state = KillerState.Investigate;
          this.investigateTarget = { x: survTX, y: survTY };
          this.stateTimer = 0;
        }
        if (ts && ts.health === HealthState.Dying) {
          this.state = KillerState.Attack;
          this.stateTimer = 0;
        }
        break;

      case KillerState.Attack:
        if (this.killer.isCarrying) {
          this.state = KillerState.Carry;
          this.stateTimer = 0;
        }
        break;

      case KillerState.Carry:
        // Find nearest hook
        break;

      case KillerState.Hook:
        this.state = KillerState.Patrol;
        this.stateTimer = 0;
        this.reacting = true;
        this.reactionTimer = 1.5; // Pause after hooking
        break;
    }

    // Actions based on state
    switch (this.state) {
      case KillerState.Patrol:
        result = this.doPatrol(dt, killerTX, killerTY);
        // Patrol at walking speed — not sprinting around the map
        result.walk = true;
        break;

      case KillerState.Investigate:
        if (this.investigateTarget) {
          result = this.moveToTile(dt, killerTX, killerTY, this.investigateTarget.x, this.investigateTarget.y);
          result.walk = true; // Walk while investigating
        }
        break;

      case KillerState.Chase:
        result = this.moveToTile(dt, killerTX, killerTY, survTX, survTY);
        if (distToSurvivor < TILE_SIZE * 1.8) {
          result.interact = true; // Attack
        }
        // Use ability less aggressively — only when medium range and with some randomness
        if (distToSurvivor < TILE_SIZE * 7 && distToSurvivor > TILE_SIZE * 4 && Math.random() < 0.02) {
          result.ability = true;
        }
        break;

      case KillerState.Attack:
        // Move to dying survivor to pick up — slight delay before pickup
        if (this.stateTimer > 0.5 && ts) {
          result = this.moveToTile(dt, killerTX, killerTY, survTX, survTY);
          if (distToSurvivor < TILE_SIZE * 1.5) {
            result.interact = true; // Pickup
          }
        }
        break;

      case KillerState.Carry: {
        const nearestHook = this.findNearestHook(killerTX, killerTY);
        if (nearestHook) {
          const hookTX = nearestHook.tileX;
          const hookTY = nearestHook.tileY;
          result = this.moveToTile(dt, killerTX, killerTY, hookTX, hookTY);
          const hookDist = Math.sqrt(
            (this.killer.centerX - nearestHook.centerX) ** 2 +
            (this.killer.centerY - nearestHook.centerY) ** 2,
          );
          if (hookDist < TILE_SIZE * 1.5) {
            result.interact = true; // Hook
            this.state = KillerState.Hook;
          }
        } else {
          // No hook? Drop and attack again
          result.interact = true;
        }
        break;
      }
    }

    return result;
  }

  private doPatrol(dt: number, tx: number, ty: number): { dx: number; dy: number; interact: boolean; ability: boolean; walk: boolean } {
    // Patrol towards generators — pick a new target less frequently
    if (!this.patrolTarget || this.stateTimer > 15) {
      const unfinishedGens = this.generators.filter((g) => !g.completed);
      if (unfinishedGens.length > 0) {
        const gen = unfinishedGens[Math.floor(Math.random() * unfinishedGens.length)];
        this.patrolTarget = { x: gen.tileX, y: gen.tileY };
      } else {
        this.patrolTarget = {
          x: 2 + Math.floor(Math.random() * (this.map.cols - 4)),
          y: 2 + Math.floor(Math.random() * (this.map.rows - 4)),
        };
      }
      this.stateTimer = 0;
      this.currentPath = null;
    }

    return this.moveToTile(dt, tx, ty, this.patrolTarget.x, this.patrolTarget.y);
  }

  private moveToTile(
    _dt: number,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ): { dx: number; dy: number; interact: boolean; ability: boolean; walk: boolean } {
    // Recalculate path less frequently (0.8s instead of 0.5s)
    if (this.pathRecalcTimer > 0.8 || !this.currentPath) {
      this.currentPath = this.pathfinding.findPath(fromX, fromY, toX, toY);
      this.pathIndex = 0;
      this.pathRecalcTimer = 0;
    }

    if (!this.currentPath || this.pathIndex >= this.currentPath.length) {
      return { dx: 0, dy: 0, interact: false, ability: false, walk: false };
    }

    const next = this.currentPath[this.pathIndex];
    const targetPx = next.x * TILE_SIZE + TILE_SIZE / 2;
    const targetPy = next.y * TILE_SIZE + TILE_SIZE / 2;

    let dx = targetPx - this.killer.centerX;
    let dy = targetPy - this.killer.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < TILE_SIZE * 0.4) {
      this.pathIndex++;
      if (this.pathIndex < this.currentPath.length) {
        const n = this.currentPath[this.pathIndex];
        dx = n.x * TILE_SIZE + TILE_SIZE / 2 - this.killer.centerX;
        dy = n.y * TILE_SIZE + TILE_SIZE / 2 - this.killer.centerY;
      }
    }

    // Normalize to -1..1
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return {
      dx: dx / len,
      dy: dy / len,
      interact: false,
      ability: false,
      walk: false,
    };
  }

  private findRecentScratchMark(): { x: number; y: number } | null {
    const marks = this.scratchMarks.allMarks;
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i];
      const tx = Math.floor(m.x / TILE_SIZE);
      const ty = Math.floor(m.y / TILE_SIZE);
      if (this.killerFog.isVisible(tx, ty)) {
        return { x: tx, y: ty };
      }
    }
    return null;
  }

  private findNearestHook(tx: number, ty: number): Hook | null {
    let best: Hook | null = null;
    let bestDist = Infinity;
    for (const hook of this.hooks) {
      if (hook.hooked) continue;
      const d = Math.abs(hook.tileX - tx) + Math.abs(hook.tileY - ty);
      if (d < bestDist) {
        bestDist = d;
        best = hook;
      }
    }
    return best;
  }
}
