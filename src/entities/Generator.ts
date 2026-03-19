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
    // Generator body
    if (this.completed) {
      ctx.fillStyle = '#44ff44';
    } else if (this.beingRepaired) {
      ctx.fillStyle = '#ffdd44';
    } else {
      ctx.fillStyle = '#886622';
    }
    ctx.fillRect(screenX + 1, screenY + 1, TILE_SIZE - 2, TILE_SIZE - 2);

    // Gear icon
    ctx.fillStyle = '#000';
    ctx.font = '10px monospace';
    ctx.fillText('G', screenX + 4, screenY + 12);

    // Progress bar
    if (!this.completed && this.progress > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(screenX, screenY - 5, TILE_SIZE, 4);
      ctx.fillStyle = '#44ff44';
      ctx.fillRect(screenX, screenY - 5, TILE_SIZE * this.progress, 4);
    }
  }
}
