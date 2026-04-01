import { AIController } from './AIController';
import { Survivor } from '../entities/Survivor';
import { Killer } from '../entities/Killer';
import { TileMap } from '../world/TileMap';
import { FogOfWar } from '../world/FogOfWar';
import { Pathfinding } from '../world/Pathfinding';
import { Generator } from '../entities/Generator';
import { ExitGate } from '../entities/ExitGate';
import { Hook } from '../entities/Hook';
import { Locker } from '../entities/Locker';
import { TILE_SIZE, TERROR_RADIUS } from '../constants';
import { HealthState } from '../types';

enum SurvivorState {
  Repair,
  Flee,
  Hide,
  Escape,
  Rescue,
}

export class SurvivorAI implements AIController {
  private state: SurvivorState = SurvivorState.Repair;
  private pathfinding: Pathfinding;
  private currentPath: { x: number; y: number }[] | null = null;
  private pathIndex = 0;
  private pathRecalcTimer = 0;
  private stateTimer = 0;
  private targetGen: Generator | null = null;
  private targetHook: Hook | null = null;

  constructor(
    private survivor: Survivor,
    private killer: Killer,
    private map: TileMap,
    private survivorFog: FogOfWar,
    private generators: Generator[],
    private exitGates: ExitGate[],
    private hooks: Hook[],
    private lockers: Locker[],
    private gatesPowered: () => boolean,
  ) {
    this.pathfinding = new Pathfinding(map);
  }

  update(dt: number): { dx: number; dy: number; interact: boolean; ability: boolean; walk: boolean } {
    this.stateTimer += dt;
    this.pathRecalcTimer += dt;

    const survTX = Math.floor(this.survivor.centerX / TILE_SIZE);
    const survTY = Math.floor(this.survivor.centerY / TILE_SIZE);
    const killerTX = Math.floor(this.killer.centerX / TILE_SIZE);
    const killerTY = Math.floor(this.killer.centerY / TILE_SIZE);

    const distToKiller = Math.sqrt(
      (this.survivor.centerX - this.killer.centerX) ** 2 +
      (this.survivor.centerY - this.killer.centerY) ** 2,
    );
    const canSeeKiller = this.survivorFog.isVisible(killerTX, killerTY);
    const killerClose = distToKiller < TERROR_RADIUS * TILE_SIZE * 0.5; // Less sensitive

    let result = { dx: 0, dy: 0, interact: false, ability: false, walk: false };

    // Check if a teammate is hooked
    const hookedHook = this.findHookedTeammate();

    // State transitions
    switch (this.state) {
      case SurvivorState.Repair:
        if (canSeeKiller && killerClose) {
          this.state = SurvivorState.Flee;
          this.stateTimer = 0;
          this.currentPath = null;
        } else if (hookedHook) {
          this.state = SurvivorState.Rescue;
          this.targetHook = hookedHook;
          this.stateTimer = 0;
          this.currentPath = null;
        } else if (this.gatesPowered()) {
          this.state = SurvivorState.Escape;
          this.stateTimer = 0;
          this.currentPath = null;
        }
        break;

      case SurvivorState.Flee:
        if (!canSeeKiller && this.stateTimer > 4) {
          this.state = hookedHook ? SurvivorState.Rescue : SurvivorState.Repair;
          this.targetHook = hookedHook;
          this.stateTimer = 0;
          this.currentPath = null;
        }
        // Use ability when fleeing — less often
        if (killerClose && distToKiller < TILE_SIZE * 3 && Math.random() < 0.03) {
          result.ability = true;
        }
        // Body block: use ability when killer is carrying a teammate and close
        if (this.killer.isCarrying && killerClose && distToKiller < TILE_SIZE * 5) {
          result.ability = true;
        }
        break;

      case SurvivorState.Hide:
        if (this.stateTimer > 8) {
          this.state = SurvivorState.Repair;
          this.stateTimer = 0;
        }
        break;

      case SurvivorState.Escape:
        if (canSeeKiller && killerClose) {
          this.state = SurvivorState.Flee;
          this.stateTimer = 0;
          this.currentPath = null;
        }
        break;

      case SurvivorState.Rescue:
        if (canSeeKiller && killerClose) {
          this.state = SurvivorState.Flee;
          this.stateTimer = 0;
          this.currentPath = null;
        } else if (!this.targetHook || !this.targetHook.hooked) {
          // Teammate was freed
          this.state = this.gatesPowered() ? SurvivorState.Escape : SurvivorState.Repair;
          this.targetHook = null;
          this.stateTimer = 0;
          this.currentPath = null;
        }
        break;
    }

    // Actions
    switch (this.state) {
      case SurvivorState.Repair: {
        // Find nearest unfinished generator
        if (!this.targetGen || this.targetGen.completed) {
          this.targetGen = this.findNearestGenerator(survTX, survTY);
        }
        if (this.targetGen) {
          const genDist = Math.sqrt(
            (this.survivor.centerX - this.targetGen.centerX) ** 2 +
            (this.survivor.centerY - this.targetGen.centerY) ** 2,
          );
          if (genDist < TILE_SIZE * 2) {
            // Close enough - repair
            result.interact = true;
            result.walk = true; // Be quiet
          } else {
            result = this.moveToTile(dt, survTX, survTY, this.targetGen.tileX, this.targetGen.tileY);
          }
        }
        break;
      }

      case SurvivorState.Flee: {
        // Run away from killer
        const awayX = survTX + (survTX - killerTX);
        const awayY = survTY + (survTY - killerTY);
        const clampedX = Math.max(2, Math.min(this.map.cols - 3, awayX));
        const clampedY = Math.max(2, Math.min(this.map.rows - 3, awayY));
        result = this.moveToTile(dt, survTX, survTY, clampedX, clampedY);
        break;
      }

      case SurvivorState.Hide:
        // Stay still
        result.walk = true;
        break;

      case SurvivorState.Escape: {
        // Find nearest open/powered exit gate
        let bestGate: ExitGate | null = null;
        let bestDist = Infinity;
        for (const gate of this.exitGates) {
          if (!gate.powered) continue;
          const d = Math.abs(gate.tileX - survTX) + Math.abs(gate.tileY - survTY);
          if (d < bestDist) {
            bestDist = d;
            bestGate = gate;
          }
        }
        if (bestGate) {
          const gateDist = Math.sqrt(
            (this.survivor.centerX - bestGate.centerX) ** 2 +
            (this.survivor.centerY - bestGate.centerY) ** 2,
          );
          if (gateDist < TILE_SIZE * 2.5) {
            result.interact = true; // Open/enter gate
          } else {
            result = this.moveToTile(dt, survTX, survTY, bestGate.tileX, bestGate.tileY);
          }
        }
        break;
      }

      case SurvivorState.Rescue: {
        if (this.targetHook && this.targetHook.hooked) {
          const hookDist = Math.sqrt(
            (this.survivor.centerX - this.targetHook.centerX) ** 2 +
            (this.survivor.centerY - this.targetHook.centerY) ** 2,
          );
          if (hookDist < TILE_SIZE * 2) {
            // Close enough — hold interact to rescue
            result.interact = true;
          } else {
            result = this.moveToTile(dt, survTX, survTY, this.targetHook.tileX, this.targetHook.tileY);
          }
        }
        break;
      }
    }

    return result;
  }

  private moveToTile(
    _dt: number,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ): { dx: number; dy: number; interact: boolean; ability: boolean; walk: boolean } {
    if (this.pathRecalcTimer > 0.5 || !this.currentPath) {
      this.currentPath = this.pathfinding.findPath(fromX, fromY, toX, toY);
      this.pathIndex = 0;
      this.pathRecalcTimer = 0;
    }

    if (!this.currentPath || this.pathIndex >= this.currentPath.length) {
      return { dx: 0, dy: 0, interact: false, ability: false, walk: false };
    }

    const next = this.currentPath[this.pathIndex];
    let dx = next.x * TILE_SIZE + TILE_SIZE / 2 - this.survivor.centerX;
    let dy = next.y * TILE_SIZE + TILE_SIZE / 2 - this.survivor.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < TILE_SIZE * 0.4) {
      this.pathIndex++;
      if (this.pathIndex < this.currentPath.length) {
        const n = this.currentPath[this.pathIndex];
        dx = n.x * TILE_SIZE + TILE_SIZE / 2 - this.survivor.centerX;
        dy = n.y * TILE_SIZE + TILE_SIZE / 2 - this.survivor.centerY;
      }
    }

    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { dx: dx / len, dy: dy / len, interact: false, ability: false, walk: false };
  }

  private findHookedTeammate(): Hook | null {
    for (const hook of this.hooks) {
      if (hook.hooked && hook.hooked !== this.survivor) {
        return hook;
      }
    }
    return null;
  }

  private findNearestGenerator(tx: number, ty: number): Generator | null {
    let best: Generator | null = null;
    let bestDist = Infinity;
    for (const gen of this.generators) {
      if (gen.completed) continue;
      const d = Math.abs(gen.tileX - tx) + Math.abs(gen.tileY - ty);
      if (d < bestDist) {
        bestDist = d;
        best = gen;
      }
    }
    return best;
  }
}
