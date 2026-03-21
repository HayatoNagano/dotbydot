import { Survivor } from '../entities/Survivor';
import { Killer } from '../entities/Killer';
import { Ability } from '../abilities/Ability';
import { Hook } from '../entities/Hook';
import { HealthState } from '../types';
import { GENERATORS_TO_POWER } from '../constants';
import { PlayerRole } from './Menu';

const HEALTH_JP: Record<string, string> = {
  healthy: '健康',
  injured: '負傷',
  dying: '瀕死',
  dead: '死亡',
};

export class InfoPanel {
  private el: HTMLDivElement;
  private survivorSection: HTMLDivElement;
  private objectiveSection: HTMLDivElement;
  private killerSection: HTMLDivElement;
  private controlsSection: HTMLDivElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'info-panel';
    this.el.style.cssText = `
      position: fixed; bottom: 0; left: 0; width: 100%;
      background: #0a0a14; border-top: 1px solid #333;
      font-family: monospace; color: #ccc; padding: 8px 16px;
      display: flex; gap: 24px; z-index: 10;
      box-sizing: border-box;
    `;

    this.survivorSection = this.createSection();
    this.objectiveSection = this.createSection();
    this.killerSection = this.createSection();
    this.controlsSection = document.createElement('div');
    this.controlsSection.style.cssText = 'position: absolute; bottom: 4px; left: 16px; right: 16px; font-size: 10px; color: #444;';

    this.el.appendChild(this.survivorSection);
    this.el.appendChild(this.objectiveSection);
    this.el.appendChild(this.killerSection);
    this.el.appendChild(this.controlsSection);

    document.body.appendChild(this.el);
  }

  private createSection(): HTMLDivElement {
    const div = document.createElement('div');
    div.style.cssText = 'flex: 1; min-width: 0;';
    return div;
  }

  update(
    survivors: Survivor[],
    killer: Killer,
    generatorsCompleted: number,
    gatesPowered: boolean,
    isRepairing: boolean,
    survivorAbilities: (Ability | null)[],
    killerAbility: Ability | null,
    hookedHooks: (Hook | null)[],
    playerRole: PlayerRole = PlayerRole.Survivor,
  ): void {
    // Survivor section — show all survivors
    let survivorHtml = '';
    for (let i = 0; i < survivors.length; i++) {
      const survivor = survivors[i];
      const hookedHook = hookedHooks[i] ?? null;
      const survivorAbility = survivorAbilities[i] ?? null;
      const label = i === 0 ? 'サバイバー1' : 'サバイバー2';
      const sColor = survivor.health === HealthState.Healthy ? '#00ff88'
        : survivor.health === HealthState.Injured ? '#ffaa00'
        : survivor.health === HealthState.Dying ? '#ff6600' : '#444';

      const healthText = HEALTH_JP[survivor.health] ?? survivor.health;
      survivorHtml += `<div style="color:${sColor};font-weight:bold;font-size:12px">◆ ${label}</div>`;
      survivorHtml += `<div style="font-size:11px">体力: ${healthText}`;

      if (hookedHook) {
        survivorHtml += ` <span style="color:#ff4444">フック(${hookedHook.stage}/2)</span>`;
      } else if (survivor.isBeingCarried) {
        survivorHtml += ` <span style="color:#ff4444">搬送中</span>`;
      } else if (i === 0 && isRepairing) {
        survivorHtml += ` <span style="color:#ffdd44">修理中</span>`;
      }
      survivorHtml += '</div>';

      if (survivorAbility) {
        const abColor = survivorAbility.isReady ? '#00ff88' : survivorAbility.isActive ? '#ffff00' : '#555';
        const abStatus = survivorAbility.isActive ? '発動中'
          : survivorAbility.isReady ? (i === 0 ? '使用可[Q]' : '使用可')
          : `CT${survivorAbility.cooldownRemaining.toFixed(0)}s`;
        survivorHtml += `<div style="color:${abColor};font-size:10px">${survivorAbility.name}: ${abStatus}</div>`;
      }
    }

    this.survivorSection.innerHTML = survivorHtml;

    // Objective section
    let objHtml = `<div style="color:#fff;font-weight:bold;font-size:13px">▼ 目標</div>`;
    if (!gatesPowered) {
      const objColor = generatorsCompleted > 0 ? '#ffdd44' : '#999';
      objHtml += `<div style="color:${objColor};font-size:12px">発電機: ${generatorsCompleted} / ${GENERATORS_TO_POWER} 修理完了</div>`;
      objHtml += `<div style="color:#666;font-size:12px">発電機を修理してゲートを通電させよう</div>`;
    } else {
      objHtml += `<div style="color:#00ff88;font-size:12px">通電完了！ゲートを開けて脱出せよ</div>`;
    }
    this.objectiveSection.innerHTML = objHtml;

    // Killer section
    let killerHtml = `<div style="color:#ff4444;font-weight:bold;font-size:13px">◆ キラー</div>`;
    if (killer.isStunned) {
      killerHtml += `<div style="color:#ffff00;font-size:12px">状態: スタン中</div>`;
    } else if (killer.isCarrying) {
      killerHtml += `<div style="color:#ff8844;font-size:12px">状態: サバイバー搬送中</div>`;
    } else if (killer.canAttack) {
      killerHtml += `<div style="color:#ff4444;font-size:12px">攻撃: 可能</div>`;
    } else {
      killerHtml += `<div style="color:#888;font-size:12px">攻撃: 待機 ${killer.attackCooldown.toFixed(1)}秒</div>`;
    }

    if (killerAbility) {
      const abColor = killerAbility.isReady ? '#ff4444' : killerAbility.isActive ? '#ffff00' : '#555';
      const abStatus = killerAbility.isActive ? '発動中'
        : killerAbility.isReady ? '使用可 [,]'
        : `待機 ${killerAbility.cooldownRemaining.toFixed(1)}秒`;
      killerHtml += `<div style="color:${abColor};font-size:11px">能力: ${killerAbility.name} — ${abStatus}</div>`;
    }
    this.killerSection.innerHTML = killerHtml;

    // Controls
    if (playerRole === PlayerRole.Killer) {
      this.controlsSection.textContent = '操作 — 移動:WASD  攻撃/破壊/搬送:E  歩行:Shift  能力:Q';
    } else {
      this.controlsSection.textContent = '操作 — 移動:WASD  アクション:E  スキルチェック:Space  歩行:Shift  能力:Q';
    }
  }

  hide(): void {
    this.el.style.display = 'none';
  }

  show(): void {
    this.el.style.display = 'flex';
  }
}
