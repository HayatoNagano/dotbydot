import { TileMap } from '../world/TileMap';
import { FogOfWar } from '../world/FogOfWar';
import { Character } from '../entities/Character';
import { Survivor } from '../entities/Survivor';
import { Killer } from '../entities/Killer';
import { Pallet } from '../entities/Pallet';
import { Locker } from '../entities/Locker';
import { Generator } from '../entities/Generator';
import { Hook } from '../entities/Hook';
import { ExitGate } from '../entities/ExitGate';
import { Camera } from '../core/Camera';
import { TileType } from '../types';
import { ScratchMarks } from '../systems/ScratchMarks';
import { TerrorRadius } from '../systems/TerrorRadius';
import { SkillCheck } from '../ui/SkillCheck';
import {
  TILE_SIZE,
  COLOR_FLOOR,
  COLOR_WALL,
  COLOR_FOG,
  GAME_HEIGHT,
} from '../constants';

export interface RenderView {
  camera: Camera;
  fog: FogOfWar;
  character: Character;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export interface WorldObjects {
  pallets: Pallet[];
  lockers: Locker[];
  generators: Generator[];
  hooks: Hook[];
  exitGates: ExitGate[];
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;

  constructor(
    private canvas: HTMLCanvasElement,
    public canvasWidth: number,
    public canvasHeight: number,
  ) {
    this.canvas.width = canvasWidth;
    this.canvas.height = canvasHeight;
    this.ctx = canvas.getContext('2d')!;
  }

  clear(): void {
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
  }

  renderView(
    view: RenderView,
    map: TileMap,
    characters: Character[],
    objects: WorldObjects,
    scratchMarks: ScratchMarks,
    killer: Killer,
    survivors: Survivor[],
    alpha: number,
  ): void {
    const ctx = this.ctx;
    const { camera, fog, offsetX, offsetY, width, height } = view;

    ctx.save();
    ctx.beginPath();
    ctx.rect(offsetX, offsetY, width, height);
    ctx.clip();
    ctx.translate(offsetX, offsetY);

    ctx.fillStyle = COLOR_FOG;
    ctx.fillRect(0, 0, width, height);

    const startCol = Math.max(0, Math.floor(camera.x / TILE_SIZE));
    const startRow = Math.max(0, Math.floor(camera.y / TILE_SIZE));
    const endCol = Math.min(map.cols - 1, Math.ceil((camera.x + width) / TILE_SIZE));
    const endRow = Math.min(map.rows - 1, Math.ceil((camera.y + height) / TILE_SIZE));

    // Tiles
    const T = TILE_SIZE;
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        if (!fog.isVisible(col, row)) continue;
        const sx = col * T - camera.x;
        const sy = row * T - camera.y;

        if (map.get(col, row) === TileType.Wall) {
          // Wall base
          ctx.fillStyle = COLOR_WALL;
          ctx.fillRect(sx, sy, T, T);
          // Brick pattern
          ctx.fillStyle = 'rgba(0,0,0,0.15)';
          // Horizontal mortar lines
          ctx.fillRect(sx, sy + Math.floor(T * 0.33), T, 1);
          ctx.fillRect(sx, sy + Math.floor(T * 0.66), T, 1);
          // Vertical mortar (offset per row for brick stagger)
          const off = row % 2 === 0 ? 0 : Math.floor(T / 2);
          ctx.fillRect(sx + off, sy, 1, Math.floor(T * 0.33));
          ctx.fillRect(sx + Math.floor(T / 2) + off, sy, 1, Math.floor(T * 0.33));
          if (off > 0) {
            ctx.fillRect(sx, sy + Math.floor(T * 0.33), 1, Math.floor(T * 0.33));
          }
          ctx.fillRect(sx + Math.floor(T * 0.25) + (off > 0 ? 0 : Math.floor(T / 4)), sy + Math.floor(T * 0.33), 1, Math.floor(T * 0.33));
          ctx.fillRect(sx + Math.floor(T * 0.75) - (off > 0 ? Math.floor(T / 4) : 0), sy + Math.floor(T * 0.33), 1, Math.floor(T * 0.33));
          // Top highlight
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(sx, sy, T, 1);
          // Bottom shadow
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.fillRect(sx, sy + T - 1, T, 1);
        } else {
          // Floor base
          ctx.fillStyle = COLOR_FLOOR;
          ctx.fillRect(sx, sy, T, T);
          // Subtle grid
          ctx.strokeStyle = 'rgba(255,255,255,0.03)';
          ctx.strokeRect(sx, sy, T, T);
          // Random-looking floor variation (deterministic from position)
          const hash = ((col * 7 + row * 13) & 0xff) / 255;
          if (hash > 0.85) {
            ctx.fillStyle = 'rgba(255,255,255,0.02)';
            ctx.fillRect(sx + 2, sy + 2, T - 4, T - 4);
          } else if (hash < 0.1) {
            ctx.fillStyle = 'rgba(0,0,0,0.08)';
            const dotX = Math.floor((hash * 1000) % (T - 4)) + 2;
            const dotY = Math.floor((hash * 3000) % (T - 4)) + 2;
            ctx.fillRect(sx + dotX, sy + dotY, 2, 2);
          }
          // Occasional crack
          if (hash > 0.7 && hash < 0.75) {
            ctx.strokeStyle = 'rgba(0,0,0,0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sx + T * 0.2, sy + T * 0.3);
            ctx.lineTo(sx + T * 0.5, sy + T * 0.6);
            ctx.lineTo(sx + T * 0.7, sy + T * 0.5);
            ctx.stroke();
          }
        }
      }
    }

    // Objects
    const isKillerView = view.character === killer;

    for (const gen of objects.generators) {
      // Show completed generators to killer for 3 seconds after completion
      if (!fog.isVisible(gen.tileX, gen.tileY)) {
        if (!(isKillerView && gen.completionRevealTimer > 0)) continue;
      }
      gen.render(ctx, gen.pos.x - camera.x, gen.pos.y - camera.y);
    }

    for (const hook of objects.hooks) {
      // When killer is carrying, show nearby hooks even through fog
      if (!fog.isVisible(hook.tileX, hook.tileY)) {
        if (!(isKillerView && killer.isCarrying)) continue;
        const dx = hook.centerX - killer.centerX;
        const dy = hook.centerY - killer.centerY;
        if (dx * dx + dy * dy > (TILE_SIZE * 10) * (TILE_SIZE * 10)) continue;
      }
      hook.render(ctx, hook.pos.x - camera.x, hook.pos.y - camera.y);
    }

    for (const gate of objects.exitGates) {
      if (!fog.isVisible(gate.tileX, gate.tileY)) continue;
      gate.render(ctx, gate.pos.x - camera.x, gate.pos.y - camera.y);
    }

    for (const pallet of objects.pallets) {
      if (pallet.isDestroyed) continue;
      if (!fog.isVisible(pallet.tileX, pallet.tileY)) continue;
      pallet.render(ctx, pallet.pos.x - camera.x, pallet.pos.y - camera.y);
    }

    for (const locker of objects.lockers) {
      if (!fog.isVisible(locker.tileX, locker.tileY)) continue;
      locker.render(ctx, locker.pos.x - camera.x, locker.pos.y - camera.y);
    }

    // Scratch marks (killer only)
    if (isKillerView) {
      scratchMarks.render(ctx, camera.x, camera.y);
    }

    // Characters
    for (const char of characters) {
      if (char instanceof Survivor && char.isBeingCarried) continue;
      if (char instanceof Survivor) {
        const inLocker = objects.lockers.some((l) => l.occupant === char);
        if (inLocker) continue;
        const onHook = objects.hooks.some((h) => h.hooked === char);
        if (onHook) continue;
      }

      const tileX = Math.floor(char.centerX / TILE_SIZE);
      const tileY = Math.floor(char.centerY / TILE_SIZE);
      if (!fog.isVisible(tileX, tileY)) continue;

      const lerpPos = char.getLerpPos(alpha);
      const sx = lerpPos.x - camera.x;
      const sy = lerpPos.y - camera.y;

      if (char instanceof Survivor) {
        char.render(ctx, sx, sy);
      } else if (char instanceof Killer) {
        char.render(ctx, sx, sy);
      }
    }

    // Fog edge
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        if (!fog.isVisible(col, row)) continue;
        if (
          !fog.isVisible(col - 1, row) ||
          !fog.isVisible(col + 1, row) ||
          !fog.isVisible(col, row - 1) ||
          !fog.isVisible(col, row + 1)
        ) {
          const sx = col * TILE_SIZE - camera.x;
          const sy = row * TILE_SIZE - camera.y;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // Terror radius (survivor view) — use the view's character (player survivor)
    if (!isKillerView) {
      const viewSurvivor = view.character as Survivor;
      const intensity = TerrorRadius.getIntensity(
        killer.centerX, killer.centerY,
        viewSurvivor.centerX, viewSurvivor.centerY,
      );
      TerrorRadius.renderEffect(ctx, intensity, width, height);
    }

    // Stun overlay
    if (isKillerView && killer.isStunned) {
      ctx.fillStyle = `rgba(255, 255, 0, ${0.1 + Math.sin(Date.now() / 100) * 0.05})`;
      ctx.fillRect(0, 0, width, height);
    }

    ctx.restore();
  }

  /** Render skill check inside the viewport */
  renderSkillCheck(view: RenderView, skillCheck: SkillCheck, killer: Killer): void {
    if (view.character === killer) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(view.offsetX, view.offsetY);
    skillCheck.render(ctx, view.width / 2, view.height / 2);
    ctx.restore();
  }

  renderSplitDivider(): void {
    const ctx = this.ctx;
    const midX = this.canvasWidth / 2;
    ctx.fillStyle = '#333';
    ctx.fillRect(midX - 1, 0, 2, GAME_HEIGHT);
  }
}
