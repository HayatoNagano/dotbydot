import { Entity } from './Entity';
import { Survivor } from './Survivor';
import { TILE_SIZE } from '../constants';

export class Trap extends Entity {
  armed = true;
  trapped: Survivor | null = null;
  trapTimer = 0;
  private static readonly TRAP_DURATION = 5; // seconds

  constructor(px: number, py: number) {
    super(px, py, TILE_SIZE * 0.6, TILE_SIZE * 0.6);
  }

  get tileX(): number {
    return Math.floor(this.pos.x / TILE_SIZE);
  }

  get tileY(): number {
    return Math.floor(this.pos.y / TILE_SIZE);
  }

  checkTrigger(survivor: Survivor): boolean {
    if (!this.armed || this.trapped) return false;
    const dx = survivor.centerX - this.centerX;
    const dy = survivor.centerY - this.centerY;
    if (Math.sqrt(dx * dx + dy * dy) < TILE_SIZE * 0.8) {
      this.trapped = survivor;
      this.armed = false;
      this.trapTimer = Trap.TRAP_DURATION;
      return true;
    }
    return false;
  }

  update(dt: number): void {
    if (this.trapped && this.trapTimer > 0) {
      this.trapTimer -= dt;
      // Survivor stays in place
      this.trapped.pos.x = this.pos.x;
      this.trapped.pos.y = this.pos.y;
      if (this.trapTimer <= 0) {
        this.release();
      }
    }
  }

  release(): void {
    this.trapped = null;
    this.trapTimer = 0;
  }

  render(ctx: CanvasRenderingContext2D, screenX: number, screenY: number): void {
    if (!this.armed && !this.trapped) return;

    if (this.trapped) {
      // Triggered trap
      ctx.fillStyle = '#ff4400';
      ctx.fillRect(screenX, screenY, this.width, this.height);
      // Timer bar
      const ratio = this.trapTimer / Trap.TRAP_DURATION;
      ctx.fillStyle = '#ffaa00';
      ctx.fillRect(screenX, screenY - 4, this.width * ratio, 3);
    } else {
      // Armed trap (subtle)
      ctx.fillStyle = 'rgba(100, 60, 20, 0.6)';
      ctx.fillRect(screenX + 2, screenY + 2, this.width - 4, this.height - 4);
    }
  }
}
