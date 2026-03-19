import { Character } from './Character';
import { HealthState } from '../types';
import { SURVIVOR_RUN_SPEED, COLOR_SURVIVOR, TILE_SIZE } from '../constants';

export class Survivor extends Character {
  health: HealthState = HealthState.Healthy;
  /** Time on current hook stage (seconds) */
  hookTimer = 0;
  hookStage = 0; // 0=not hooked, 1=first stage, 2=second stage
  isBeingCarried = false;
  /** Whether the one-time self-unhook has been used */
  selfUnhookUsed = false;

  constructor(x: number, y: number) {
    super(x, y, SURVIVOR_RUN_SPEED, COLOR_SURVIVOR);
  }

  get isIncapacitated(): boolean {
    return this.health === HealthState.Dying || this.health === HealthState.Dead || this.isBeingCarried;
  }

  takeDamage(): void {
    switch (this.health) {
      case HealthState.Healthy:
        this.health = HealthState.Injured;
        break;
      case HealthState.Injured:
        this.health = HealthState.Dying;
        this.speed = SURVIVOR_RUN_SPEED * 0.3; // crawling
        break;
    }
  }

  get speedMultiplier(): number {
    if (this.health === HealthState.Dying) return 0.3;
    return 1;
  }

  render(ctx: CanvasRenderingContext2D, screenX: number, screenY: number): void {
    // Color based on health state
    switch (this.health) {
      case HealthState.Healthy:
        ctx.fillStyle = COLOR_SURVIVOR;
        break;
      case HealthState.Injured:
        ctx.fillStyle = '#ffaa00';
        break;
      case HealthState.Dying:
        ctx.fillStyle = '#ff6600';
        break;
      case HealthState.Dead:
        ctx.fillStyle = '#444444';
        break;
    }
    ctx.fillRect(screenX, screenY, this.width, this.height);

    // Direction indicator
    if (this.health !== HealthState.Dying && this.health !== HealthState.Dead) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      const cx = screenX + this.width / 2;
      const cy = screenY + this.height / 2;
      const s = 3;
      ctx.beginPath();
      switch (this.direction) {
        case 'up':    ctx.moveTo(cx, cy - s - 2); ctx.lineTo(cx - s, cy - 1); ctx.lineTo(cx + s, cy - 1); break;
        case 'down':  ctx.moveTo(cx, cy + s + 2); ctx.lineTo(cx - s, cy + 1); ctx.lineTo(cx + s, cy + 1); break;
        case 'left':  ctx.moveTo(cx - s - 2, cy); ctx.lineTo(cx - 1, cy - s); ctx.lineTo(cx - 1, cy + s); break;
        case 'right': ctx.moveTo(cx + s + 2, cy); ctx.lineTo(cx + 1, cy - s); ctx.lineTo(cx + 1, cy + s); break;
      }
      ctx.closePath();
      ctx.fill();
    }
  }
}
