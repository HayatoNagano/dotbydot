import { Entity } from './Entity';
import { Survivor } from './Survivor';
import { HealthState } from '../types';
import { TILE_SIZE, HOOK_STAGE_DURATION, SURVIVOR_RUN_SPEED } from '../constants';
import { eventBus } from '../core/EventBus';

/** Amount of progress needed to self-unhook (accumulated by mashing Space) */
const SELF_UNHOOK_THRESHOLD = 3.0;
/** Progress added per Space press */
const SELF_UNHOOK_PER_PRESS = 0.35;
/** Progress decays per second if not pressing */
const SELF_UNHOOK_DECAY = 0.5;

export class Hook extends Entity {
  hooked: Survivor | null = null;
  stage = 0; // 0=empty, 1=first stage, 2=second stage
  stageTimer = 0;
  /** Self-unhook progress (0..SELF_UNHOOK_THRESHOLD) */
  selfUnhookProgress = 0;

  constructor(tileX: number, tileY: number) {
    super(tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }

  get tileX(): number {
    return Math.floor(this.pos.x / TILE_SIZE);
  }

  get tileY(): number {
    return Math.floor(this.pos.y / TILE_SIZE);
  }

  get selfUnhookRatio(): number {
    return Math.min(1, this.selfUnhookProgress / SELF_UNHOOK_THRESHOLD);
  }

  get canSelfUnhook(): boolean {
    return this.hooked !== null && !this.hooked.selfUnhookUsed;
  }

  hookSurvivor(survivor: Survivor): void {
    this.hooked = survivor;
    survivor.isBeingCarried = false;
    survivor.pos.x = this.pos.x;
    survivor.pos.y = this.pos.y;
    this.stage = survivor.hookStage + 1;
    survivor.hookStage = this.stage;
    this.stageTimer = 0;
    this.selfUnhookProgress = 0;
  }

  /** Called when survivor presses Space while hooked. Returns true if unhook succeeded. */
  attemptSelfUnhook(): boolean {
    if (!this.hooked || this.hooked.selfUnhookUsed) return false;

    this.selfUnhookProgress += SELF_UNHOOK_PER_PRESS;
    if (this.selfUnhookProgress >= SELF_UNHOOK_THRESHOLD) {
      this.hooked.selfUnhookUsed = true;
      // Unhook restores to injured state
      this.hooked.health = HealthState.Injured;
      this.hooked.speed = SURVIVOR_RUN_SPEED; // restore run speed
      this.release();
      return true;
    }
    return false;
  }

  update(dt: number): void {
    if (!this.hooked) return;

    // Decay self-unhook progress
    if (this.selfUnhookProgress > 0) {
      this.selfUnhookProgress = Math.max(0, this.selfUnhookProgress - SELF_UNHOOK_DECAY * dt);
    }

    this.stageTimer += dt;
    if (this.stageTimer >= HOOK_STAGE_DURATION) {
      if (this.stage >= 2) {
        // Sacrifice complete
        this.hooked.health = HealthState.Dead;
        eventBus.emit('survivor_sacrificed', this.hooked);
        this.release();
      } else {
        // Advance to next stage
        this.stage = 2;
        this.hooked.hookStage = 2;
        this.stageTimer = 0;
        this.selfUnhookProgress = 0;
      }
    }
  }

  release(): void {
    if (this.hooked) {
      this.hooked.pos.x = this.pos.x + TILE_SIZE;
      this.hooked.pos.y = this.pos.y;
      this.hooked = null;
      this.stage = 0;
      this.stageTimer = 0;
      this.selfUnhookProgress = 0;
    }
  }

  render(ctx: CanvasRenderingContext2D, screenX: number, screenY: number): void {
    const T = TILE_SIZE;
    const p = Math.floor(T / 16);

    // Base/ground plate
    ctx.fillStyle = '#555';
    ctx.fillRect(screenX + T / 2 - 4 * p, screenY + T - 3 * p, 8 * p, 3 * p);

    // Hook pole
    ctx.fillStyle = '#777';
    ctx.fillRect(screenX + T / 2 - p, screenY + 2 * p, 2 * p, T - 5 * p);
    // Pole highlight
    ctx.fillStyle = '#999';
    ctx.fillRect(screenX + T / 2 - p, screenY + 2 * p, p, T - 5 * p);

    // Hook curve at top
    ctx.fillStyle = '#aaa';
    ctx.fillRect(screenX + T / 2, screenY + 2 * p, 5 * p, 2 * p);
    ctx.fillRect(screenX + T / 2 + 4 * p, screenY + 2 * p, 2 * p, 6 * p);
    // Hook point
    ctx.fillStyle = '#ccc';
    ctx.fillRect(screenX + T / 2 + 3 * p, screenY + 7 * p, 2 * p, 2 * p);
    ctx.fillRect(screenX + T / 2 + 2 * p, screenY + 8 * p, 2 * p, p);

    if (this.hooked) {
      // Hooked survivor dangling
      const dangle = Math.sin(Date.now() / 400) * p;
      ctx.fillStyle = '#ff6600';
      ctx.fillRect(screenX + 3 * p + dangle, screenY + 6 * p, T - 6 * p, T - 8 * p);
      // Survivor head
      ctx.fillStyle = '#eebb80';
      ctx.fillRect(screenX + T / 2 - 2 * p + dangle, screenY + 4 * p, 4 * p, 3 * p);

      // Stage timer bar
      const ratio = this.stageTimer / HOOK_STAGE_DURATION;
      const barH = 3 * p;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(screenX - p, screenY - barH - 3 * p, T + 2 * p, barH);
      ctx.fillStyle = this.stage === 1 ? '#ffaa00' : '#ff0000';
      ctx.fillRect(screenX - p, screenY - barH - 3 * p, (T + 2 * p) * ratio, barH);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(screenX - p, screenY - barH - 3 * p, T + 2 * p, barH);

      // Self-unhook progress bar (below hook)
      if (this.canSelfUnhook && this.selfUnhookProgress > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(screenX - 2 * p, screenY + T + 2 * p, T + 4 * p, barH);
        ctx.fillStyle = '#00ccff';
        ctx.fillRect(screenX - 2 * p, screenY + T + 2 * p, (T + 4 * p) * this.selfUnhookRatio, barH);
      }

      // Stage indicator
      ctx.fillStyle = '#fff';
      ctx.font = `${6 * p}px monospace`;
      ctx.fillText(`${this.stage}/2`, screenX + p, screenY - barH - 4 * p);
    }
  }
}
