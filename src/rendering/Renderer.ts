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
import { TileType, HealthState } from '../types';
import { ScratchMarks } from '../systems/ScratchMarks';
import { TerrorRadius } from '../systems/TerrorRadius';
import { SkillCheck } from '../ui/SkillCheck';
import { Ability } from '../abilities/Ability';
import { Hook as HookEntity } from '../entities/Hook';
import {
  TILE_SIZE,
  COLOR_FLOOR,
  COLOR_WALL,
  COLOR_FOG,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GAME_HEIGHT,
  HUD_HEIGHT,
  GENERATORS_TO_POWER,
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

const HEALTH_JP: Record<string, string> = {
  healthy: '健康',
  injured: '負傷',
  dying: '瀕死',
  dead: '死亡',
};

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
    survivor: Survivor,
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
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        if (!fog.isVisible(col, row)) continue;
        const sx = col * TILE_SIZE - camera.x;
        const sy = row * TILE_SIZE - camera.y;
        ctx.fillStyle = map.get(col, row) === TileType.Wall ? COLOR_WALL : COLOR_FLOOR;
        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
        if (map.get(col, row) === TileType.Floor) {
          ctx.strokeStyle = 'rgba(255,255,255,0.03)';
          ctx.strokeRect(sx, sy, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // Objects
    const isKillerView = view.character === killer;

    for (const gen of objects.generators) {
      if (!fog.isVisible(gen.tileX, gen.tileY)) continue;
      gen.render(ctx, gen.pos.x - camera.x, gen.pos.y - camera.y);
    }

    for (const hook of objects.hooks) {
      if (!fog.isVisible(hook.tileX, hook.tileY)) continue;
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

    // Terror radius (survivor view)
    if (!isKillerView) {
      const intensity = TerrorRadius.getIntensity(
        killer.centerX, killer.centerY,
        survivor.centerX, survivor.centerY,
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

  /** Render skill check inside the viewport (part of gameplay) */
  renderSkillCheck(view: RenderView, skillCheck: SkillCheck, killer: Killer): void {
    if (view.character === killer) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(view.offsetX, view.offsetY);
    skillCheck.render(ctx, view.width / 2, view.height / 2);
    ctx.restore();
  }

  /** Render the info panel below the game area in Japanese */
  renderInfoPanel(
    survivor: Survivor,
    killer: Killer,
    generatorsCompleted: number,
    gatesPowered: boolean,
    isRepairing: boolean,
    survivorAbility: Ability | null,
    killerAbility: Ability | null,
    isSingleView: boolean,
    hookedHook: HookEntity | null,
  ): void {
    const ctx = this.ctx;
    const panelY = GAME_HEIGHT;

    // Panel background
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, panelY, CANVAS_WIDTH, HUD_HEIGHT);

    // Top border line
    ctx.fillStyle = '#333';
    ctx.fillRect(0, panelY, CANVAS_WIDTH, 1);

    const leftCol = 12;
    const midCol = CANVAS_WIDTH / 2 - 80;
    const rightCol = CANVAS_WIDTH - 280;

    // ─── Survivor info (left) ───
    const sColor = survivor.health === HealthState.Healthy ? '#00ff88'
      : survivor.health === HealthState.Injured ? '#ffaa00'
      : survivor.health === HealthState.Dying ? '#ff6600' : '#444';

    ctx.fillStyle = sColor;
    ctx.font = 'bold 13px monospace';
    ctx.fillText('◆ サバイバー', leftCol, panelY + 18);

    ctx.font = '12px monospace';
    ctx.fillStyle = '#ccc';
    const healthText = HEALTH_JP[survivor.health] ?? survivor.health;
    ctx.fillText(`体力: ${healthText}`, leftCol, panelY + 36);

    // Survivor status
    ctx.fillStyle = '#999';
    if (hookedHook) {
      ctx.fillStyle = '#ff4444';
      ctx.fillText(`フックに吊られている (段階 ${hookedHook.stage}/2)`, leftCol, panelY + 52);
      // Self-unhook info
      if (hookedHook.canSelfUnhook) {
        ctx.fillStyle = '#00ccff';
        ctx.font = '11px monospace';
        ctx.fillText('Space連打で自力脱出！', leftCol, panelY + 66);
        // Progress bar
        const barX = leftCol + 150;
        const barW = 80;
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(barX, panelY + 57, barW, 10);
        ctx.fillStyle = '#00ccff';
        ctx.fillRect(barX, panelY + 57, barW * hookedHook.selfUnhookRatio, 10);
        ctx.fillStyle = '#fff';
        ctx.font = '9px monospace';
        ctx.fillText(`${Math.floor(hookedHook.selfUnhookRatio * 100)}%`, barX + barW + 4, panelY + 66);
      } else {
        ctx.fillStyle = '#666';
        ctx.font = '11px monospace';
        ctx.fillText('自力脱出: 使用済み', leftCol, panelY + 66);
      }
    } else if (isRepairing) {
      ctx.fillStyle = '#ffdd44';
      ctx.fillText('修理中...', leftCol, panelY + 52);
    } else if (survivor.isBeingCarried) {
      ctx.fillStyle = '#ff4444';
      ctx.fillText('搬送されている', leftCol, panelY + 52);
    } else if (survivor.health === HealthState.Dying) {
      ctx.fillText('這って移動', leftCol, panelY + 52);
    } else if (survivor.walking) {
      ctx.fillText('歩行中（静音）', leftCol, panelY + 52);
    }

    // Survivor ability
    if (survivorAbility) {
      const abY = panelY + 70;
      ctx.fillStyle = survivorAbility.isReady ? '#00ff88' : survivorAbility.isActive ? '#ffff00' : '#555';
      ctx.font = '11px monospace';
      const abStatus = survivorAbility.isActive ? '発動中'
        : survivorAbility.isReady ? '使用可 [Q]'
        : `待機 ${survivorAbility.cooldownRemaining.toFixed(1)}秒`;
      ctx.fillText(`能力: ${survivorAbility.name} — ${abStatus}`, leftCol, abY);
    }

    // ─── Center: game status ───
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('▼ 目標', midCol, panelY + 18);

    ctx.font = '12px monospace';
    if (!gatesPowered) {
      ctx.fillStyle = generatorsCompleted > 0 ? '#ffdd44' : '#999';
      ctx.fillText(`発電機: ${generatorsCompleted} / ${GENERATORS_TO_POWER} 修理完了`, midCol, panelY + 36);
      ctx.fillStyle = '#666';
      ctx.fillText('発電機を修理してゲートを通電させよう', midCol, panelY + 52);
    } else {
      ctx.fillStyle = '#00ff88';
      ctx.fillText('通電完了！ゲートを開けて脱出せよ', midCol, panelY + 36);
    }

    // ─── Killer info (right) ───
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('◆ キラー', rightCol, panelY + 18);

    ctx.font = '12px monospace';
    ctx.fillStyle = '#ccc';
    if (killer.isStunned) {
      ctx.fillStyle = '#ffff00';
      ctx.fillText('状態: スタン中', rightCol, panelY + 36);
    } else if (killer.isCarrying) {
      ctx.fillStyle = '#ff8844';
      ctx.fillText('状態: サバイバー搬送中', rightCol, panelY + 36);
    } else if (killer.canAttack) {
      ctx.fillStyle = '#ff4444';
      ctx.fillText('攻撃: 可能', rightCol, panelY + 36);
    } else {
      ctx.fillStyle = '#888';
      ctx.fillText(`攻撃: 待機 ${killer.attackCooldown.toFixed(1)}秒`, rightCol, panelY + 36);
    }

    // Killer ability
    if (killerAbility) {
      const abY = panelY + 52;
      ctx.fillStyle = killerAbility.isReady ? '#ff4444' : killerAbility.isActive ? '#ffff00' : '#555';
      ctx.font = '11px monospace';
      const abStatus = killerAbility.isActive ? '発動中'
        : killerAbility.isReady ? '使用可 [,]'
        : `待機 ${killerAbility.cooldownRemaining.toFixed(1)}秒`;
      ctx.fillText(`能力: ${killerAbility.name} — ${abStatus}`, rightCol, abY);
    }

    // ─── Controls (bottom of panel) ───
    ctx.fillStyle = '#444';
    ctx.font = '10px monospace';
    const ctrlY = panelY + HUD_HEIGHT - 10;
    if (isSingleView) {
      ctx.fillText(
        '操作 — 移動:WASD  アクション:E  スキルチェック:Space  歩行:Shift  能力:Q',
        leftCol, ctrlY,
      );
    } else {
      ctx.fillText(
        'サバイバー — 移動:WASD  アクション:E  スキルチェック:Space  歩行:Shift  能力:Q',
        leftCol, ctrlY,
      );
      ctx.fillText(
        'キラー — 移動:矢印  攻撃/破壊:.  搬送降ろす:/  能力:,',
        CANVAS_WIDTH / 2 + 10, ctrlY,
      );
    }
  }

  renderSplitDivider(): void {
    const ctx = this.ctx;
    const midX = this.canvasWidth / 2;
    ctx.fillStyle = '#333';
    ctx.fillRect(midX - 1, 0, 2, GAME_HEIGHT);
  }
}
