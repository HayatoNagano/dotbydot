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

  render(ctx: CanvasRenderingContext2D, screenX: number, screenY: number, killerView = false): void {
    if (!this.armed && !this.trapped) return;
    const W = this.width;
    const p = Math.max(1, Math.floor(W / 10));

    if (this.trapped) {
      // Triggered trap — closed jaws
      ctx.fillStyle = '#883300';
      ctx.fillRect(screenX + p, screenY + p, W - 2 * p, W - 2 * p);
      // Jaw teeth
      ctx.fillStyle = '#cc5500';
      ctx.fillRect(screenX, screenY + Math.floor(W / 2) - p, W, 2 * p);
      // Teeth spikes
      ctx.fillStyle = '#aaa';
      for (let i = 0; i < 4; i++) {
        const tx = screenX + Math.floor(W * (i + 0.5) / 4);
        ctx.fillRect(tx, screenY + Math.floor(W / 2) - 2 * p, p, p);
        ctx.fillRect(tx, screenY + Math.floor(W / 2) + p, p, p);
      }
      // Timer bar
      const ratio = this.trapTimer / Trap.TRAP_DURATION;
      const barH = 2 * p;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(screenX, screenY - barH - p, W, barH);
      ctx.fillStyle = '#ffaa00';
      ctx.fillRect(screenX, screenY - barH - p, W * ratio, barH);
    } else if (killerView) {
      // Armed trap — killer sees it clearly
      ctx.fillStyle = '#664400';
      ctx.fillRect(screenX + p, screenY + p, W - 2 * p, W - 2 * p);
      // Open jaw outline
      ctx.strokeStyle = '#aa7733';
      ctx.lineWidth = 1;
      ctx.strokeRect(screenX + p, screenY + p, W - 2 * p, W - 2 * p);
      // Teeth
      ctx.fillStyle = '#cccccc';
      ctx.fillRect(screenX + 2 * p, screenY + p, p, p);
      ctx.fillRect(screenX + W - 3 * p, screenY + p, p, p);
      ctx.fillRect(screenX + 2 * p, screenY + W - 2 * p, p, p);
      ctx.fillRect(screenX + W - 3 * p, screenY + W - 2 * p, p, p);
      // Highlight marker
      ctx.strokeStyle = 'rgba(255, 100, 0, 0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(screenX, screenY, W, W);
    } else {
      // Armed trap — survivor sees it subtle
      ctx.fillStyle = 'rgba(80, 50, 20, 0.5)';
      ctx.fillRect(screenX + p, screenY + p, W - 2 * p, W - 2 * p);
      ctx.strokeStyle = 'rgba(150, 100, 40, 0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(screenX + p, screenY + p, W - 2 * p, W - 2 * p);
      ctx.fillStyle = 'rgba(180, 180, 180, 0.4)';
      ctx.fillRect(screenX + 2 * p, screenY + p, p, p);
      ctx.fillRect(screenX + W - 3 * p, screenY + p, p, p);
      ctx.fillRect(screenX + 2 * p, screenY + W - 2 * p, p, p);
      ctx.fillRect(screenX + W - 3 * p, screenY + W - 2 * p, p, p);
    }
  }
}
