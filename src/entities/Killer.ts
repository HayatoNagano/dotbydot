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
    const S = this.width;
    const p = Math.floor(S / 10); // ~4px at S=43
    const cx = screenX + S / 2;

    const frame = this.isMoving ? (Math.floor(this.animTime * 2) % 4) : 0;
    const bob = this.isMoving ? (frame === 1 || frame === 3 ? -p : 0) : 0;

    const baseColor = this.isStunned ? '#772233' : this.color;
    const baseDark = this.isStunned ? '#551122' : '#880011';
    const baseVDark = this.isStunned ? '#330011' : '#440011';
    const skinColor = this.isStunned ? '#887766' : '#bba090';
    const skinDark = this.isStunned ? '#665544' : '#997060';

    const baseY = screenY + bob;

    // ── Ground shadow ──
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(screenX + p, screenY + S - p, S - 2 * p, p);
    ctx.fillRect(screenX, screenY + S - 2 * p, S, p);

    // ── Stun stars ──
    if (this.isStunned) {
      const t = Date.now() / 200;
      for (let i = 0; i < 4; i++) {
        const a = t + i * 1.57;
        const sx = cx + Math.cos(a) * 5 * p;
        const sy = baseY - 2 * p + Math.sin(a) * 3 * p;
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(sx, sy, p, p);
        ctx.fillStyle = '#ffaa00';
        ctx.fillRect(sx + p, sy, p, p);
      }
    }

    // ── Direction-specific rendering ──
    if (this.direction === 'down') {
      this.renderFront(ctx, cx, baseY, p, frame, baseColor, baseDark, baseVDark, skinColor, skinDark);
    } else if (this.direction === 'up') {
      this.renderBack(ctx, cx, baseY, p, frame, baseColor, baseDark, baseVDark);
    } else if (this.direction === 'left') {
      this.renderSide(ctx, cx, baseY, p, frame, baseColor, baseDark, baseVDark, skinColor, skinDark, -1);
    } else {
      this.renderSide(ctx, cx, baseY, p, frame, baseColor, baseDark, baseVDark, skinColor, skinDark, 1);
    }

    // ── Carrying survivor ──
    if (this.carrying) {
      const headY = baseY;
      ctx.fillStyle = '#cc8800';
      ctx.fillRect(cx - 4 * p, headY - 3 * p, 8 * p, 2 * p);
      ctx.fillStyle = '#aa6600';
      ctx.fillRect(cx - 4 * p, headY - 2 * p, 8 * p, p);
      // Survivor head
      ctx.fillStyle = '#ffd5a0';
      ctx.fillRect(cx + 3 * p, headY - 5 * p, 3 * p, 3 * p);
      // Hair
      ctx.fillStyle = '#553322';
      ctx.fillRect(cx + 3 * p, headY - 5 * p, 3 * p, p);
      // Dangling legs
      ctx.fillStyle = '#2255aa';
      ctx.fillRect(cx - 5 * p, headY - 3 * p, 2 * p, 3 * p);
    }

    // ── Attack cooldown bar ──
    if (this.attackCooldown > 0) {
      const ratio = this.attackCooldown / Killer.ATTACK_COOLDOWN;
      const barH = 2 * p;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(screenX, screenY - barH - 2 * p, S, barH);
      ctx.fillStyle = '#ff3333';
      ctx.fillRect(screenX, screenY - barH - 2 * p, S * ratio, barH);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(screenX, screenY - barH - 2 * p, S, barH);
    }
  }

  // ────────────────────────────────────────────────
  //  DOWN — Menacing frontal view
  // ────────────────────────────────────────────────
  private renderFront(
    ctx: CanvasRenderingContext2D, cx: number, baseY: number, p: number, frame: number,
    baseColor: string, baseDark: string, baseVDark: string, skinColor: string, skinDark: string,
  ): void {
    const headW = 7 * p;
    const headH = 5 * p;
    const bodyW = 8 * p;
    const bodyH = 5 * p;
    const legW = 3 * p;
    const legH = 3 * p;

    const headX = cx - headW / 2;
    const headY = baseY;
    const bodyX = cx - bodyW / 2;
    const bodyY = headY + headH;
    const legBaseY = bodyY + bodyH;

    // ── Legs — combat boots ──
    const legSpread = p;
    const drawBoot = (lx: number, ly: number, h: number) => {
      ctx.fillStyle = '#222';
      ctx.fillRect(lx, ly, legW, h - p);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(lx, ly + Math.floor(h / 2), legW, p);
      ctx.fillStyle = '#333';
      ctx.fillRect(lx - p, ly + h - 2 * p, legW + 2 * p, 2 * p);
      ctx.fillStyle = '#444';
      ctx.fillRect(lx - p, ly + h - 2 * p, legW + 2 * p, p);
    };
    if (frame === 0 || frame === 2) {
      drawBoot(cx - legW - legSpread, legBaseY, legH);
      drawBoot(cx + legSpread, legBaseY, legH);
    } else if (frame === 1) {
      drawBoot(cx - legW - legSpread, legBaseY - p, legH);
      drawBoot(cx + legSpread, legBaseY + p, legH - p);
    } else {
      drawBoot(cx - legW - legSpread, legBaseY + p, legH - p);
      drawBoot(cx + legSpread, legBaseY - p, legH);
    }

    // ── Body — layered coat ──
    ctx.fillStyle = baseVDark;
    ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
    ctx.fillStyle = baseDark;
    ctx.fillRect(bodyX + p, bodyY, bodyW - 2 * p, bodyH - p);
    // Inner vest
    ctx.fillStyle = baseColor;
    ctx.fillRect(bodyX + 2 * p, bodyY + p, bodyW - 4 * p, bodyH - 2 * p);
    // Vertical coat seam
    ctx.fillStyle = baseVDark;
    ctx.fillRect(cx - Math.floor(p / 2), bodyY + p, p, bodyH - 2 * p);
    // Belt
    ctx.fillStyle = '#444';
    ctx.fillRect(bodyX, bodyY + bodyH - p, bodyW, p);
    ctx.fillStyle = '#888';
    ctx.fillRect(cx - p, bodyY + bodyH - p, 2 * p, p);
    // Shoulder pads
    ctx.fillStyle = baseDark;
    ctx.fillRect(bodyX - p, bodyY, 2 * p, 2 * p);
    ctx.fillRect(bodyX + bodyW - p, bodyY, 2 * p, 2 * p);
    // Shoulder pad highlights
    ctx.fillStyle = baseColor;
    ctx.fillRect(bodyX - p, bodyY, 2 * p, p);
    ctx.fillRect(bodyX + bodyW - p, bodyY, 2 * p, p);

    // ── Arms ──
    const armW = 2 * p;
    const armH = 5 * p;
    const armSwing = this.isMoving ? (frame === 1 ? -p : frame === 3 ? p : 0) : 0;

    // Left arm
    ctx.fillStyle = skinColor;
    ctx.fillRect(bodyX - armW - p, bodyY - armSwing, armW, armH);
    ctx.fillStyle = skinDark;
    ctx.fillRect(bodyX - armW - p, bodyY + armH - 2 * p - armSwing, armW, p);
    ctx.fillStyle = '#333';
    ctx.fillRect(bodyX - armW - p, bodyY + armH - p - armSwing, armW + p, p);

    // Right arm (weapon arm)
    ctx.fillStyle = skinColor;
    ctx.fillRect(bodyX + bodyW + p, bodyY + armSwing, armW, armH);
    ctx.fillStyle = skinDark;
    ctx.fillRect(bodyX + bodyW + p, bodyY + armH - 2 * p + armSwing, armW, p);
    ctx.fillStyle = '#333';
    ctx.fillRect(bodyX + bodyW, bodyY + armH - p + armSwing, armW + 2 * p, p);

    // ── Weapon (cleaver) — right hand ──
    if (!this.isStunned) {
      const wepX = bodyX + bodyW + armW;
      const wepSwing = armSwing;
      ctx.fillStyle = '#6B4226';
      ctx.fillRect(wepX, bodyY + wepSwing, p, 3 * p);
      ctx.fillStyle = '#8B5A2B';
      ctx.fillRect(wepX, bodyY + wepSwing + p, p, p);
      ctx.fillStyle = '#aab';
      ctx.fillRect(wepX - p, bodyY + 3 * p + wepSwing, 3 * p, 4 * p);
      ctx.fillStyle = '#ccd';
      ctx.fillRect(wepX - p, bodyY + 3 * p + wepSwing, p, 4 * p);
      ctx.fillStyle = '#889';
      ctx.fillRect(wepX + p, bodyY + 3 * p + wepSwing, p, 4 * p);
      ctx.fillStyle = 'rgba(180,0,0,0.5)';
      ctx.fillRect(wepX, bodyY + 5 * p + wepSwing, p, 2 * p);
    }

    // ── Head — hood with deep shadow ──
    ctx.fillStyle = baseVDark;
    ctx.fillRect(headX - p, headY, headW + 2 * p, headH + p);
    // Hood peak
    ctx.fillStyle = baseVDark;
    ctx.fillRect(cx - 2 * p, headY - p, 4 * p, p);
    // Hood inner fabric
    ctx.fillStyle = baseDark;
    ctx.fillRect(headX, headY + p, headW, headH - p);
    // Face void (deep shadow)
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(headX + p, headY + 2 * p, headW - 2 * p, headH - 3 * p);
    // Darker inner shadow
    ctx.fillStyle = '#050505';
    ctx.fillRect(headX + 2 * p, headY + 3 * p, headW - 4 * p, p);

    // ── Glowing red eyes ──
    if (!this.isStunned) {
      const eyeRow = headY + 3 * p;
      const flicker = 0.6 + Math.sin(Date.now() / 300) * 0.4;
      // Red glow aura
      ctx.fillStyle = `rgba(255, 0, 0, ${flicker * 0.15})`;
      ctx.fillRect(headX + p, eyeRow - p, headW - 2 * p, 3 * p);
      ctx.globalAlpha = flicker;
      // Left eye
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(headX + 2 * p, eyeRow, p, p);
      ctx.fillStyle = '#ff4422';
      ctx.fillRect(headX + 2 * p + p, eyeRow, Math.floor(p / 2), p);
      // Right eye
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(headX + headW - 3 * p, eyeRow, p, p);
      ctx.fillStyle = '#ff4422';
      ctx.fillRect(headX + headW - 3 * p - Math.floor(p / 2), eyeRow, Math.floor(p / 2), p);
      ctx.globalAlpha = 1;
    }
  }

  // ────────────────────────────────────────────────
  //  UP — Back view: hood/cape, weapon on back
  // ────────────────────────────────────────────────
  private renderBack(
    ctx: CanvasRenderingContext2D, cx: number, baseY: number, p: number, frame: number,
    baseColor: string, baseDark: string, baseVDark: string,
  ): void {
    const headW = 7 * p;
    const headH = 5 * p;
    const bodyW = 8 * p;
    const bodyH = 5 * p;
    const legW = 3 * p;
    const legH = 3 * p;

    const headX = cx - headW / 2;
    const headY = baseY;
    const bodyX = cx - bodyW / 2;
    const bodyY = headY + headH;
    const legBaseY = bodyY + bodyH;

    // ── Legs ──
    const legSpread = p;
    const drawBoot = (lx: number, ly: number, h: number) => {
      ctx.fillStyle = '#222';
      ctx.fillRect(lx, ly, legW, h - p);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(lx, ly + Math.floor(h / 2), legW, p);
      ctx.fillStyle = '#333';
      ctx.fillRect(lx - p, ly + h - 2 * p, legW + 2 * p, 2 * p);
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(lx - p, ly + h - 2 * p, legW + 2 * p, p);
    };
    if (frame === 0 || frame === 2) {
      drawBoot(cx - legW - legSpread, legBaseY, legH);
      drawBoot(cx + legSpread, legBaseY, legH);
    } else if (frame === 1) {
      drawBoot(cx - legW - legSpread, legBaseY - p, legH);
      drawBoot(cx + legSpread, legBaseY + p, legH - p);
    } else {
      drawBoot(cx - legW - legSpread, legBaseY + p, legH - p);
      drawBoot(cx + legSpread, legBaseY - p, legH);
    }

    // ── Body — back of coat ──
    ctx.fillStyle = baseVDark;
    ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
    ctx.fillStyle = baseDark;
    ctx.fillRect(bodyX + p, bodyY, bodyW - 2 * p, bodyH - p);
    // Back coat texture — vertical seam
    ctx.fillStyle = baseVDark;
    ctx.fillRect(cx - Math.floor(p / 2), bodyY, p, bodyH - p);
    // Coat tails (slight flare at bottom)
    ctx.fillStyle = baseDark;
    ctx.fillRect(bodyX - p, bodyY + bodyH - 2 * p, p, 2 * p);
    ctx.fillRect(bodyX + bodyW, bodyY + bodyH - 2 * p, p, 2 * p);
    // Belt from behind
    ctx.fillStyle = '#444';
    ctx.fillRect(bodyX, bodyY + bodyH - p, bodyW, p);
    // Shoulder pads (back)
    ctx.fillStyle = baseDark;
    ctx.fillRect(bodyX - p, bodyY, 2 * p, 2 * p);
    ctx.fillRect(bodyX + bodyW - p, bodyY, 2 * p, 2 * p);
    ctx.fillStyle = baseColor;
    ctx.fillRect(bodyX - p, bodyY, 2 * p, p);
    ctx.fillRect(bodyX + bodyW - p, bodyY, 2 * p, p);

    // ── Arms (back view — close to body) ──
    const armW = 2 * p;
    const armH = 4 * p;
    const armSwing = this.isMoving ? (frame === 1 ? -p : frame === 3 ? p : 0) : 0;

    ctx.fillStyle = baseDark;
    ctx.fillRect(bodyX - armW, bodyY + armSwing, armW, armH);
    ctx.fillRect(bodyX + bodyW, bodyY - armSwing, armW, armH);
    // Gloves
    ctx.fillStyle = '#333';
    ctx.fillRect(bodyX - armW, bodyY + armH - p + armSwing, armW, p);
    ctx.fillRect(bodyX + bodyW, bodyY + armH - p - armSwing, armW, p);

    // ── Weapon slung on back (diagonal cleaver) ──
    if (!this.isStunned) {
      // Handle across back (diagonal)
      ctx.fillStyle = '#6B4226';
      ctx.fillRect(cx - 2 * p, bodyY + p, p, 3 * p);
      ctx.fillRect(cx - p, bodyY, p, 3 * p);
      // Blade poking above shoulder
      ctx.fillStyle = '#aab';
      ctx.fillRect(cx - p, bodyY - 2 * p, 2 * p, 3 * p);
      ctx.fillStyle = '#ccd';
      ctx.fillRect(cx - p, bodyY - 2 * p, p, 3 * p);
      // Strap across back
      ctx.fillStyle = '#554433';
      ctx.fillRect(bodyX + p, bodyY + p, bodyW - 2 * p, p);
    }

    // ── Head — back of hood/cape ──
    ctx.fillStyle = baseVDark;
    ctx.fillRect(headX - p, headY, headW + 2 * p, headH + p);
    // Hood peak
    ctx.fillStyle = baseVDark;
    ctx.fillRect(cx - 2 * p, headY - p, 4 * p, p);
    // Hood fabric folds
    ctx.fillStyle = baseDark;
    ctx.fillRect(headX, headY + p, headW, headH - p);
    // Hood center seam
    ctx.fillStyle = baseVDark;
    ctx.fillRect(cx - Math.floor(p / 2), headY + p, p, headH - p);
    // Hood fold details
    ctx.fillStyle = baseColor;
    ctx.fillRect(headX + p, headY + 2 * p, p, headH - 3 * p);
    ctx.fillRect(headX + headW - 2 * p, headY + 2 * p, p, headH - 3 * p);
    // NO eyes visible from behind
  }

  // ────────────────────────────────────────────────
  //  LEFT / RIGHT — Profile view (dir: -1=left, 1=right)
  // ────────────────────────────────────────────────
  private renderSide(
    ctx: CanvasRenderingContext2D, cx: number, baseY: number, p: number, frame: number,
    baseColor: string, baseDark: string, baseVDark: string, skinColor: string, skinDark: string,
    dir: number,
  ): void {
    const headW = 6 * p;
    const headH = 5 * p;
    const bodyW = 6 * p; // narrower profile
    const bodyH = 5 * p;
    const legW = 3 * p;
    const legH = 3 * p;

    const headX = cx - headW / 2;
    const headY = baseY;
    const bodyX = cx - bodyW / 2;
    const bodyY = headY + headH;
    const legBaseY = bodyY + bodyH;

    // ── Legs ──
    const drawBoot = (lx: number, ly: number, h: number) => {
      ctx.fillStyle = '#222';
      ctx.fillRect(lx, ly, legW, h - p);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(lx, ly + Math.floor(h / 2), legW, p);
      ctx.fillStyle = '#333';
      ctx.fillRect(lx - p, ly + h - 2 * p, legW + 2 * p, 2 * p);
      ctx.fillStyle = '#444';
      ctx.fillRect(lx - p, ly + h - 2 * p, legW + 2 * p, p);
    };
    // Side view: legs overlap, one in front of the other
    const frontLegX = cx - legW / 2 + dir * p;
    const backLegX = cx - legW / 2 - dir * p;
    if (frame === 0 || frame === 2) {
      drawBoot(backLegX, legBaseY, legH);
      drawBoot(frontLegX, legBaseY, legH);
    } else if (frame === 1) {
      drawBoot(backLegX, legBaseY + p, legH - p);
      drawBoot(frontLegX, legBaseY - p, legH);
    } else {
      drawBoot(backLegX, legBaseY - p, legH);
      drawBoot(frontLegX, legBaseY + p, legH - p);
    }

    // ── Body — side profile (narrower) ──
    ctx.fillStyle = baseVDark;
    ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
    ctx.fillStyle = baseDark;
    ctx.fillRect(bodyX + p, bodyY, bodyW - 2 * p, bodyH - p);
    // Inner vest visible on front side
    ctx.fillStyle = baseColor;
    const vestX = dir > 0 ? bodyX + bodyW - 3 * p : bodyX + p;
    ctx.fillRect(vestX, bodyY + p, 2 * p, bodyH - 2 * p);
    // Belt
    ctx.fillStyle = '#444';
    ctx.fillRect(bodyX, bodyY + bodyH - p, bodyW, p);
    // Belt buckle (on front side)
    ctx.fillStyle = '#888';
    const buckleX = dir > 0 ? bodyX + bodyW - 2 * p : bodyX + p;
    ctx.fillRect(buckleX, bodyY + bodyH - p, p, p);
    // Shoulder pad (one visible)
    ctx.fillStyle = baseDark;
    ctx.fillRect(bodyX + (dir > 0 ? bodyW - p : 0), bodyY, 2 * p, 2 * p);
    ctx.fillStyle = baseColor;
    ctx.fillRect(bodyX + (dir > 0 ? bodyW - p : 0), bodyY, 2 * p, p);

    // ── Arm — weapon arm on facing side ──
    const armW = 2 * p;
    const armH = 5 * p;
    const armSwing = this.isMoving ? (frame === 1 ? -p : frame === 3 ? p : 0) : 0;

    // Weapon arm (in front)
    const armX = dir > 0 ? bodyX + bodyW : bodyX - armW;
    ctx.fillStyle = skinColor;
    ctx.fillRect(armX, bodyY + armSwing, armW, armH);
    ctx.fillStyle = skinDark;
    ctx.fillRect(armX, bodyY + armH - 2 * p + armSwing, armW, p);
    // Glove
    ctx.fillStyle = '#333';
    ctx.fillRect(armX, bodyY + armH - p + armSwing, armW + p * dir, p);

    // ── Weapon (cleaver) — held in front ──
    if (!this.isStunned) {
      const wepX = dir > 0 ? armX + armW : armX - 2 * p;
      const wepSwing = armSwing;
      // Handle
      ctx.fillStyle = '#6B4226';
      ctx.fillRect(wepX, bodyY + wepSwing, p, 3 * p);
      ctx.fillStyle = '#8B5A2B';
      ctx.fillRect(wepX, bodyY + wepSwing + p, p, p);
      // Blade
      ctx.fillStyle = '#aab';
      ctx.fillRect(wepX - (dir > 0 ? 0 : p), bodyY + 3 * p + wepSwing, 2 * p, 4 * p);
      // Edge highlight (facing edge)
      ctx.fillStyle = '#ccd';
      const edgeX = dir > 0 ? wepX : wepX - p;
      ctx.fillRect(edgeX, bodyY + 3 * p + wepSwing, p, 4 * p);
      // Blood
      ctx.fillStyle = 'rgba(180,0,0,0.5)';
      ctx.fillRect(wepX, bodyY + 5 * p + wepSwing, p, 2 * p);
    }

    // ── Head — profile hood ──
    // Hood slightly extended in facing direction
    const hoodExtend = dir * p;
    ctx.fillStyle = baseVDark;
    ctx.fillRect(headX - p + Math.min(hoodExtend, 0), headY, headW + 2 * p + Math.abs(hoodExtend), headH + p);
    // Hood peak
    ctx.fillStyle = baseVDark;
    ctx.fillRect(cx - p + dir * p, headY - p, 3 * p, p);
    // Hood inner fabric
    ctx.fillStyle = baseDark;
    ctx.fillRect(headX, headY + p, headW, headH - p);
    // Face shadow (profile — narrower)
    const faceX = dir > 0 ? headX + headW - 3 * p : headX + p;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(faceX, headY + 2 * p, 2 * p, headH - 3 * p);

    // ── Single glowing eye (profile) ──
    if (!this.isStunned) {
      const eyeRow = headY + 3 * p;
      const flicker = 0.6 + Math.sin(Date.now() / 300) * 0.4;
      // Glow aura
      ctx.fillStyle = `rgba(255, 0, 0, ${flicker * 0.15})`;
      ctx.fillRect(faceX, eyeRow - p, 2 * p, 3 * p);
      ctx.globalAlpha = flicker;
      // Single eye
      const eyeX = dir > 0 ? faceX + p : faceX;
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(eyeX, eyeRow, p, p);
      ctx.fillStyle = '#ff4422';
      ctx.fillRect(eyeX + (dir > 0 ? Math.floor(p / 2) : -Math.floor(p / 2)), eyeRow, Math.floor(p / 2), p);
      ctx.globalAlpha = 1;
    }
  }
}
