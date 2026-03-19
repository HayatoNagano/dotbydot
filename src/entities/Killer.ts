import { Character } from './Character';
import { Survivor } from './Survivor';
import { HealthState } from '../types';
import { KILLER_BASE_SPEED, COLOR_KILLER, TILE_SIZE } from '../constants';

export class Killer extends Character {
  attackCooldown = 0;
  stunTimer = 0;
  carrying: Survivor | null = null;
  private static readonly ATTACK_COOLDOWN = 1.5; // seconds
  private static readonly ATTACK_RANGE = TILE_SIZE * 1.5;
  private static readonly STUN_DURATION = 2.0;

  constructor(x: number, y: number) {
    super(x, y, KILLER_BASE_SPEED, COLOR_KILLER);
  }

  get isStunned(): boolean {
    return this.stunTimer > 0;
  }

  get canAttack(): boolean {
    return this.attackCooldown <= 0 && !this.isStunned && this.carrying === null;
  }

  get isCarrying(): boolean {
    return this.carrying !== null;
  }

  updateTimers(dt: number): void {
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.stunTimer > 0) this.stunTimer -= dt;
  }

  tryAttack(survivor: Survivor): boolean {
    if (!this.canAttack) return false;
    if (survivor.isIncapacitated) return false;

    const dx = survivor.centerX - this.centerX;
    const dy = survivor.centerY - this.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= Killer.ATTACK_RANGE) {
      survivor.takeDamage();
      this.attackCooldown = Killer.ATTACK_COOLDOWN;

      // Lunge forward slightly
      return true;
    }
    return false;
  }

  tryPickup(survivor: Survivor): boolean {
    if (this.carrying !== null) return false;
    if (survivor.health !== HealthState.Dying) return false;

    const dx = survivor.centerX - this.centerX;
    const dy = survivor.centerY - this.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= TILE_SIZE * 1.5) {
      this.carrying = survivor;
      survivor.isBeingCarried = true;
      this.speed = KILLER_BASE_SPEED * 0.85; // slower when carrying
      return true;
    }
    return false;
  }

  dropSurvivor(): void {
    if (this.carrying) {
      this.carrying.isBeingCarried = false;
      this.carrying.pos.x = this.pos.x;
      this.carrying.pos.y = this.pos.y + TILE_SIZE;
      this.carrying = null;
      this.speed = KILLER_BASE_SPEED;
    }
  }

  applyStun(): void {
    this.stunTimer = Killer.STUN_DURATION;
    this.dropSurvivor();
  }

  render(ctx: CanvasRenderingContext2D, screenX: number, screenY: number): void {
    // Killer body
    ctx.fillStyle = this.isStunned ? '#882233' : COLOR_KILLER;
    ctx.fillRect(screenX, screenY, this.width, this.height);

    // Direction indicator
    if (!this.isStunned) {
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

    // Attack cooldown indicator
    if (this.attackCooldown > 0) {
      ctx.fillStyle = 'rgba(255,0,0,0.5)';
      const ratio = this.attackCooldown / Killer.ATTACK_COOLDOWN;
      ctx.fillRect(screenX, screenY - 4, this.width * ratio, 2);
    }

    // Carrying indicator
    if (this.carrying) {
      ctx.fillStyle = '#ffaa00';
      ctx.fillRect(screenX + 2, screenY - 6, this.width - 4, 3);
    }
  }
}
