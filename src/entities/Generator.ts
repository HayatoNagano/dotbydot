import { Entity } from './Entity';
import { TILE_SIZE, GENERATOR_REPAIR_TIME } from '../constants';
import { eventBus } from '../core/EventBus';

export class Generator extends Entity {
  progress = 0; // 0..1
  completed = false;
  beingRepaired = false;

  constructor(tileX: number, tileY: number) {
    super(tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }

  get tileX(): number {
    return Math.floor(this.pos.x / TILE_SIZE);
  }

  get tileY(): number {
    return Math.floor(this.pos.y / TILE_SIZE);
  }

  repair(dt: number, skillCheckBonus: number): void {
    if (this.completed) return;
    this.beingRepaired = true;
    this.progress += (dt / GENERATOR_REPAIR_TIME) * (1 + skillCheckBonus);
    if (this.progress >= 1) {
      this.progress = 1;
      this.completed = true;
      eventBus.emit('generator_completed', this);
    }
  }

  /** Called when not being repaired this frame */
  idle(): void {
    this.beingRepaired = false;
  }

  render(ctx: CanvasRenderingContext2D, screenX: number, screenY: number): void {
    const T = TILE_SIZE;
    const p = Math.floor(T / 16);

    // Generator body — boxy machine
    const baseColor = this.completed ? '#33aa33' : this.beingRepaired ? '#aa8822' : '#665522';
    const darkColor = this.completed ? '#228822' : this.beingRepaired ? '#886611' : '#443311';
    const lightColor = this.completed ? '#55cc55' : this.beingRepaired ? '#ccaa44' : '#887733';

    // Main housing
    ctx.fillStyle = baseColor;
    ctx.fillRect(screenX + 2 * p, screenY + 3 * p, T - 4 * p, T - 4 * p);
    // Top face (3D effect)
    ctx.fillStyle = lightColor;
    ctx.fillRect(screenX + 2 * p, screenY + 2 * p, T - 4 * p, 2 * p);
    // Side shadow
    ctx.fillStyle = darkColor;
    ctx.fillRect(screenX + T - 3 * p, screenY + 3 * p, p, T - 5 * p);
    ctx.fillRect(screenX + 2 * p, screenY + T - 2 * p, T - 4 * p, p);

    // Pistons / internal detail
    ctx.fillStyle = '#999';
    ctx.fillRect(screenX + 4 * p, screenY + 5 * p, 2 * p, T - 8 * p);
    ctx.fillRect(screenX + T - 6 * p, screenY + 5 * p, 2 * p, T - 8 * p);

    // Center gauge
    if (!this.completed) {
      ctx.fillStyle = '#222';
      ctx.fillRect(screenX + 6 * p, screenY + 5 * p, T - 12 * p, T - 10 * p);
      // Gauge fill
      ctx.fillStyle = this.beingRepaired ? '#ffdd44' : '#554400';
      const gaugeH = Math.floor((T - 12 * p) * this.progress);
      ctx.fillRect(screenX + 7 * p, screenY + T - 6 * p - gaugeH, T - 14 * p, gaugeH);
    } else {
      // Completed — glowing center
      ctx.fillStyle = '#00ff44';
      ctx.fillRect(screenX + 6 * p, screenY + 5 * p, T - 12 * p, T - 10 * p);
    }

    // Smoke/spark when being repaired
    if (this.beingRepaired && !this.completed) {
      const t = Date.now() / 200;
      ctx.fillStyle = 'rgba(255,200,50,0.6)';
      ctx.fillRect(
        screenX + T / 2 + Math.sin(t) * 3 * p,
        screenY + 2 * p + Math.cos(t * 1.5) * 2 * p,
        p, p,
      );
    }

    // Progress bar above
    if (!this.completed && this.progress > 0) {
      const barH = 3 * p;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(screenX, screenY - barH - 2 * p, T, barH);
      ctx.fillStyle = '#44ff44';
      ctx.fillRect(screenX, screenY - barH - 2 * p, T * this.progress, barH);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(screenX, screenY - barH - 2 * p, T, barH);
    }
  }
}
