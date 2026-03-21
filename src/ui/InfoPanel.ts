import { Survivor } from '../entities/Survivor';
import { Killer } from '../entities/Killer';
import { Ability } from '../abilities/Ability';
import { Hook } from '../entities/Hook';
import { HealthState } from '../types';
import { GENERATORS_TO_POWER } from '../constants';
import { PlayerRole, SURVIVOR_DEFS, KILLER_DEFS, type CharacterDef } from '../types';

const HEALTH_JP: Record<string, string> = {
  healthy: '健康',
  injured: '負傷',
  dying: '瀕死',
  dead: '死亡',
};

const HEALTH_COLORS: Record<string, string> = {
  healthy: '#00ff88',
  injured: '#ffaa00',
  dying: '#ff4400',
  dead: '#666',
};

/** Find character def by characterId */
function findDef(id: string): CharacterDef | undefined {
  return SURVIVOR_DEFS.find((d) => d.id === id) || KILLER_DEFS.find((d) => d.id === id);
}

// Panel layout constants
const PANEL_X = 10;
const PANEL_Y = 10;
const PANEL_W = 200;
const CARD_H = 62;
const CARD_GAP = 6;
const CARD_PAD = 8;
const ICON_SIZE = 28;
const CORNER_R = 6;

/** Draw a rounded rectangle path */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/** Draw a mini pixel-art character icon */
function drawCharIcon(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number,
  color: string, isKiller: boolean, characterId: string,
): void {
  const p = Math.floor(size / 8);
  const cx = x + size / 2;
  const cy = y;

  if (isKiller) {
    // Killer icon — dark menacing figure
    const bodyColor = '#442233';
    // Hood/head
    ctx.fillStyle = bodyColor;
    ctx.fillRect(cx - p * 2, cy, p * 4, p * 3);
    // Eyes (red glow)
    ctx.fillStyle = '#ff2244';
    ctx.fillRect(cx - p * 1.5, cy + p, p, p);
    ctx.fillRect(cx + p * 0.5, cy + p, p, p);
    // Body
    ctx.fillStyle = bodyColor;
    ctx.fillRect(cx - p * 2.5, cy + p * 3, p * 5, p * 4);
    // Weapon accent
    ctx.fillStyle = color;
    if (characterId === 'huntress') {
      // Axe on side
      ctx.fillRect(cx + p * 2.5, cy + p * 2, p, p * 3);
      ctx.fillRect(cx + p * 2, cy + p * 2, p * 2, p);
    } else {
      // Blade
      ctx.fillRect(cx + p * 2.5, cy + p * 1, p, p * 4);
    }
  } else {
    // Survivor icon — lighter figure
    const skinColor = '#ffd5a0';
    // Head
    ctx.fillStyle = skinColor;
    ctx.fillRect(cx - p * 1.5, cy, p * 3, p * 3);
    // Eyes
    ctx.fillStyle = '#333';
    ctx.fillRect(cx - p, cy + p, p, p);
    ctx.fillRect(cx + p * 0.5, cy + p * 0.5, p, p);
    // Body (uses character color)
    ctx.fillStyle = color;
    ctx.fillRect(cx - p * 2, cy + p * 3, p * 4, p * 4);
    // Legs
    ctx.fillStyle = '#445';
    ctx.fillRect(cx - p * 1.5, cy + p * 7, p, p);
    ctx.fillRect(cx + p * 0.5, cy + p * 7, p, p);
  }
}

/** Draw a gauge bar */
function drawGauge(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  ratio: number, fillColor: string, bgColor: string = 'rgba(0,0,0,0.5)',
): void {
  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(x, y, w, h);
  // Fill
  if (ratio > 0) {
    ctx.fillStyle = fillColor;
    ctx.fillRect(x, y, w * Math.min(1, ratio), h);
  }
  // Border
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(x, y, w, h);
}

export class InfoPanel {
  private visible = true;

  constructor() {
    // Canvas-based: no DOM elements needed
  }

  /** Render the entire HUD overlay onto the game canvas */
  render(
    ctx: CanvasRenderingContext2D,
    survivors: Survivor[],
    killer: Killer,
    generatorsCompleted: number,
    gatesPowered: boolean,
    isRepairing: boolean,
    survivorAbilities: (Ability | null)[],
    killerAbility: Ability | null,
    hookedHooks: (Hook | null)[],
    playerRole: PlayerRole,
    inLockers: boolean[] = [],
  ): void {
    if (!this.visible) return;
    ctx.save();

    let curY = PANEL_Y;

    // ─── Survivor cards ───
    for (let i = 0; i < survivors.length; i++) {
      curY = this.renderSurvivorCard(
        ctx, curY, survivors[i], survivorAbilities[i] ?? null,
        hookedHooks[i] ?? null, isRepairing && i === 0, i,
        inLockers[i] ?? false,
      );
      curY += CARD_GAP;
    }

    // ─── Killer card ───
    curY = this.renderKillerCard(ctx, curY, killer, killerAbility, playerRole);
    curY += CARD_GAP;

    // ─── Objective bar ───
    this.renderObjective(ctx, curY, generatorsCompleted, gatesPowered);

    ctx.restore();
  }

  private renderSurvivorCard(
    ctx: CanvasRenderingContext2D,
    y: number,
    survivor: Survivor,
    ability: Ability | null,
    hookedHook: Hook | null,
    isRepairing: boolean,
    index: number,
    inLocker: boolean = false,
  ): number {
    const def = findDef(survivor.characterId);
    const color = def?.color ?? '#00ff88';
    const name = def?.nameJp ?? `サバイバー${index + 1}`;
    const healthColor = HEALTH_COLORS[survivor.health] ?? '#666';
    const healthText = HEALTH_JP[survivor.health] ?? survivor.health;

    // Card background
    roundRect(ctx, PANEL_X, y, PANEL_W, CARD_H, CORNER_R);
    ctx.fillStyle = 'rgba(0, 8, 16, 0.75)';
    ctx.fill();
    ctx.strokeStyle = survivor.health === HealthState.Dead ? 'rgba(100,100,100,0.3)' : `${color}33`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Character icon
    const iconX = PANEL_X + CARD_PAD;
    const iconY = y + 6;
    drawCharIcon(ctx, iconX, iconY, ICON_SIZE, color, false, survivor.characterId);

    // Name
    const textX = iconX + ICON_SIZE + 8;
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = survivor.health === HealthState.Dead ? '#555' : color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(name, textX, y + 6);

    // Status line: health + sub-status
    ctx.font = '10px monospace';
    ctx.fillStyle = healthColor;
    let statusText = healthText;
    if (hookedHook) {
      statusText += ` | フック(${hookedHook.stage}/2)`;
    } else if (survivor.isBeingCarried) {
      statusText = '捕獲';
      ctx.fillStyle = '#ff2244';
    } else if (inLocker) {
      statusText += ' | 潜伏中';
      ctx.fillStyle = '#6688cc';
    } else if (isRepairing) {
      statusText += ' | 修理中';
    }
    ctx.fillText(statusText, textX, y + 20);

    // Ability gauge
    if (ability) {
      const gaugeX = textX;
      const gaugeY = y + 34;
      const gaugeW = PANEL_W - (gaugeX - PANEL_X) - CARD_PAD;
      const gaugeH = 8;

      let ratio: number;
      let gaugeColor: string;
      let label: string;

      if (ability.isActive) {
        ratio = 1;
        gaugeColor = '#ffff00';
        label = '発動中';
      } else if (ability.isReady) {
        ratio = 1;
        gaugeColor = '#00ff88';
        label = 'READY';
      } else {
        ratio = 1 - (ability.cooldownRemaining / ability.cooldown);
        gaugeColor = '#336655';
        label = `${Math.ceil(ability.cooldownRemaining)}s`;
      }
      drawGauge(ctx, gaugeX, gaugeY, gaugeW, gaugeH, ratio, gaugeColor);

      // Gauge label
      ctx.font = '8px monospace';
      ctx.fillStyle = ability.isReady ? '#00ff88' : '#aaa';
      ctx.fillText(label, gaugeX + gaugeW + 2 - ctx.measureText(label).width - 2, gaugeY + gaugeH + 10);
      // Ability name on gauge
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(ability.name, gaugeX + 2, gaugeY + 7);
    }

    return y + CARD_H;
  }

  private renderKillerCard(
    ctx: CanvasRenderingContext2D,
    y: number,
    killer: Killer,
    ability: Ability | null,
    playerRole: PlayerRole,
  ): number {
    const def = findDef(killer.characterId);
    const color = def?.color ?? '#ff2244';
    const name = def?.nameJp ?? 'キラー';

    // Card background
    roundRect(ctx, PANEL_X, y, PANEL_W, CARD_H, CORNER_R);
    ctx.fillStyle = 'rgba(16, 0, 4, 0.75)';
    ctx.fill();
    ctx.strokeStyle = `${color}33`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Character icon
    const iconX = PANEL_X + CARD_PAD;
    const iconY = y + 6;
    drawCharIcon(ctx, iconX, iconY, ICON_SIZE, color, true, killer.characterId);

    // Name
    const textX = iconX + ICON_SIZE + 8;
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(name, textX, y + 6);

    // Status
    ctx.font = '10px monospace';
    if (killer.isStunned) {
      ctx.fillStyle = '#ffff00';
      ctx.fillText('スタン中', textX, y + 20);
    } else if (killer.isCarrying) {
      ctx.fillStyle = '#ff8844';
      ctx.fillText('搬送中', textX, y + 20);
    } else if (killer.canAttack) {
      ctx.fillStyle = '#ff4444';
      ctx.fillText('攻撃可能', textX, y + 20);
    } else {
      ctx.fillStyle = '#888';
      ctx.fillText(`攻撃待機 ${killer.attackCooldown.toFixed(1)}s`, textX, y + 20);
    }

    // Ability gauge
    if (ability) {
      const gaugeX = textX;
      const gaugeY = y + 34;
      const gaugeW = PANEL_W - (gaugeX - PANEL_X) - CARD_PAD;
      const gaugeH = 8;

      let ratio: number;
      let gaugeColor: string;
      let label: string;

      if (ability.isActive) {
        ratio = 1;
        gaugeColor = '#ffff00';
        label = '発動中';
      } else if (ability.isReady) {
        ratio = 1;
        gaugeColor = '#ff4444';
        label = 'READY';
      } else {
        ratio = 1 - (ability.cooldownRemaining / ability.cooldown);
        gaugeColor = '#553322';
        label = `${Math.ceil(ability.cooldownRemaining)}s`;
      }
      drawGauge(ctx, gaugeX, gaugeY, gaugeW, gaugeH, ratio, gaugeColor);

      ctx.font = '8px monospace';
      ctx.fillStyle = ability.isReady ? '#ff4444' : '#aaa';
      ctx.fillText(label, gaugeX + gaugeW + 2 - ctx.measureText(label).width - 2, gaugeY + gaugeH + 10);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(ability.name, gaugeX + 2, gaugeY + 7);
    }

    return y + CARD_H;
  }

  private renderObjective(
    ctx: CanvasRenderingContext2D,
    y: number,
    generatorsCompleted: number,
    gatesPowered: boolean,
  ): void {
    const h = 26;
    roundRect(ctx, PANEL_X, y, PANEL_W, h, CORNER_R);
    ctx.fillStyle = 'rgba(0, 8, 16, 0.75)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    if (gatesPowered) {
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#00ff88';
      ctx.fillText('⚡ 通電完了！ゲートへ！', PANEL_X + CARD_PAD, y + 8);
    } else {
      // Generator progress icons
      const iconStartX = PANEL_X + CARD_PAD;
      const iconY2 = y + 7;
      const iconSpacing = 18;

      ctx.font = '10px monospace';
      ctx.fillStyle = '#999';
      ctx.fillText('発電機', iconStartX, iconY2);

      const dotsStartX = iconStartX + 42;
      for (let i = 0; i < GENERATORS_TO_POWER; i++) {
        const dx = dotsStartX + i * iconSpacing;
        if (i < generatorsCompleted) {
          ctx.fillStyle = '#ffdd44';
          ctx.fillRect(dx, iconY2 + 1, 10, 10);
          // Checkmark
          ctx.fillStyle = '#000';
          ctx.font = '9px monospace';
          ctx.fillText('✓', dx + 1, iconY2 + 2);
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.fillRect(dx, iconY2 + 1, 10, 10);
        }
      }

      ctx.font = '9px monospace';
      ctx.fillStyle = '#666';
      ctx.fillText(`${generatorsCompleted}/${GENERATORS_TO_POWER}`, dotsStartX + GENERATORS_TO_POWER * iconSpacing + 4, iconY2 + 1);
    }
  }

  hide(): void {
    this.visible = false;
  }

  show(): void {
    this.visible = true;
  }
}
