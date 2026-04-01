import { Character } from './Character';
import { HealthState } from '../types';
import { SURVIVOR_RUN_SPEED, COLOR_SURVIVOR } from '../constants';

export class Survivor extends Character {
  health: HealthState = HealthState.Healthy;
  /** Time on current hook stage (seconds) */
  hookTimer = 0;
  hookStage = 0; // 0=not hooked, 1=first stage, 2=second stage
  isBeingCarried = false;
  /** Whether the one-time self-unhook has been used */
  selfUnhookUsed = false;
  characterId: string = 'runner';

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
    const S = this.width;
    const p = Math.floor(S / 10);
    const cx = screenX + S / 2;

    const frame = this.isMoving ? (Math.floor(this.animTime * 2) % 4) : 0;
    const bob = this.isMoving ? (frame === 1 || frame === 3 ? -p : 0) : 0;

    // ── Color palette by health state ──
    let skinColor: string, skinShadow: string;
    let bodyColor: string, bodyLight: string, bodyDark: string;
    let legColor: string, legDark: string;
    let shoeColor: string;
    let hairColor: string, hairDark: string;
    switch (this.health) {
      case HealthState.Healthy:
        skinColor = '#ffd5a0'; skinShadow = '#d4a870';
        bodyColor = this.color;
        bodyLight = this.characterId === 'dodger' ? '#88ffcc' : this.characterId === 'strong' ? '#ffbb66' : '#55ffaa';
        bodyDark = this.characterId === 'strong' ? '#cc6600' : '#009955';
        legColor = '#2255aa'; legDark = '#183d7a'; shoeColor = '#333';
        hairColor = '#553322'; hairDark = '#3a2010';
        break;
      case HealthState.Injured:
        skinColor = '#eebb80'; skinShadow = '#c09060';
        bodyColor = '#cc8800'; bodyLight = '#ddaa22'; bodyDark = '#995500';
        legColor = '#885522'; legDark = '#663311'; shoeColor = '#332211';
        hairColor = '#4a2a18'; hairDark = '#351a0c';
        break;
      case HealthState.Dying:
        skinColor = '#cc7755'; skinShadow = '#aa5533';
        bodyColor = '#993300'; bodyLight = '#aa4411'; bodyDark = '#772200';
        legColor = '#663300'; legDark = '#441100'; shoeColor = '#221100';
        hairColor = '#402010'; hairDark = '#301008';
        break;
      case HealthState.Dead: default:
        skinColor = '#666'; skinShadow = '#444';
        bodyColor = '#444'; bodyLight = '#555'; bodyDark = '#333';
        legColor = '#333'; legDark = '#222'; shoeColor = '#111';
        hairColor = '#333'; hairDark = '#222';
        break;
    }

    // ── Dying (crawling) ──
    if (this.health === HealthState.Dying) {
      const bx = screenX + p;
      const by = screenY + S - 5 * p;
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(bx, by + 4 * p, S - 2 * p, p);
      // Legs trailing
      ctx.fillStyle = legColor;
      const lOff = frame % 2 === 0 ? 0 : p;
      ctx.fillRect(bx, by + 2 * p + lOff, 2 * p, 2 * p);
      ctx.fillRect(bx + 2 * p, by + 3 * p - lOff, 2 * p, 2 * p);
      // Shoes
      ctx.fillStyle = shoeColor;
      ctx.fillRect(bx, by + 4 * p + lOff, 2 * p, p);
      ctx.fillRect(bx + 2 * p, by + 5 * p - lOff - p, 2 * p, p);
      // Body horizontal
      ctx.fillStyle = bodyColor;
      ctx.fillRect(bx + 3 * p, by + p, S - 7 * p, 3 * p);
      ctx.fillStyle = bodyDark;
      ctx.fillRect(bx + 3 * p, by + 3 * p, S - 7 * p, p);
      // Head
      ctx.fillStyle = skinColor;
      ctx.fillRect(bx + S - 6 * p, by - p, 3 * p, 3 * p);
      ctx.fillStyle = hairColor;
      ctx.fillRect(bx + S - 6 * p, by - p, 3 * p, p);
      ctx.fillStyle = skinShadow;
      ctx.fillRect(bx + S - 6 * p, by + p, 3 * p, p);
      // Arms reaching
      ctx.fillStyle = skinColor;
      const aOff = frame % 2 === 0 ? 0 : p;
      ctx.fillRect(bx + S - 4 * p + aOff, by + p, 3 * p, p);
      ctx.fillRect(bx + S - 3 * p - aOff, by + 2 * p, 3 * p, p);
      // Blood trail
      ctx.fillStyle = 'rgba(180,0,0,0.5)';
      ctx.fillRect(bx + p, by + 3 * p, p, p);
      ctx.fillRect(bx + 4 * p, by + 4 * p, p, p);
      ctx.fillRect(bx + 2 * p, by + 4 * p, p, p);
      return;
    }

    // ── Dead (lying flat) ──
    if (this.health === HealthState.Dead) {
      const bx = screenX + p;
      const by = screenY + S - 4 * p;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(bx, by + 3 * p, S - 2 * p, p);
      ctx.fillStyle = bodyColor;
      ctx.fillRect(bx + p, by + p, S - 4 * p, 2 * p);
      ctx.fillStyle = legColor;
      ctx.fillRect(bx, by + p, 2 * p, 2 * p);
      ctx.fillRect(bx + 2 * p, by + 2 * p, 2 * p, p);
      ctx.fillStyle = skinColor;
      ctx.fillRect(bx + S - 5 * p, by, 3 * p, 2 * p);
      // X eyes
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(bx + S - 5 * p + p, by, p, p);
      ctx.fillRect(bx + S - 5 * p + p, by + p, p, p);
      // Blood pool
      ctx.fillStyle = 'rgba(120,0,0,0.3)';
      ctx.fillRect(bx + 3 * p, by + 2 * p, 4 * p, p);
      ctx.fillRect(bx + 4 * p, by + 3 * p, 2 * p, p);
      return;
    }

    // ──── Standing humanoid — direction-specific rendering ────
    const baseY = screenY + bob;

    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(screenX + 2 * p, screenY + S - p, S - 4 * p, p);
    ctx.fillRect(screenX + 3 * p, screenY + S, S - 6 * p, p);

    // Walk dust particles
    if (this.isMoving && !this.walking) {
      ctx.fillStyle = 'rgba(180,170,150,0.3)';
      const t = this.animTime;
      ctx.fillRect(cx + Math.sin(t * 7) * 3 * p, screenY + S - p, p, p);
      ctx.fillRect(cx + Math.cos(t * 5) * 2 * p, screenY + S, p, p);
    }

    if (this.direction === 'down') {
      this.renderDown(ctx, cx, baseY, p, frame,
        skinColor, skinShadow, bodyColor, bodyLight, bodyDark,
        legColor, legDark, shoeColor, hairColor, hairDark);
    } else if (this.direction === 'up') {
      this.renderUp(ctx, cx, baseY, p, frame,
        skinColor, skinShadow, bodyColor, bodyLight, bodyDark,
        legColor, legDark, shoeColor, hairColor, hairDark);
    } else if (this.direction === 'left') {
      this.renderSide(ctx, cx, baseY, p, frame, false,
        skinColor, skinShadow, bodyColor, bodyLight, bodyDark,
        legColor, legDark, shoeColor, hairColor, hairDark);
    } else {
      this.renderSide(ctx, cx, baseY, p, frame, true,
        skinColor, skinShadow, bodyColor, bodyLight, bodyDark,
        legColor, legDark, shoeColor, hairColor, hairDark);
    }

    // ── Injured effects (drawn on top) ──
    if (this.health === HealthState.Injured) {
      const headH = 4 * p;
      const bodyW = 6 * p;
      const bodyX = cx - bodyW / 2;
      const bodyY = baseY + headH;
      const armSwing = this.isMoving ? (frame === 1 ? -p : frame === 3 ? p : 0) : 0;

      // Blood splatters on shirt
      ctx.fillStyle = '#cc0000';
      ctx.fillRect(bodyX + p, bodyY + p, p, 2 * p);
      ctx.fillRect(bodyX + 3 * p, bodyY + 2 * p, 2 * p, p);
      ctx.fillRect(bodyX + bodyW - 2 * p, bodyY, p, 2 * p);

      // Bandage on right arm
      ctx.fillStyle = '#ddddcc';
      if (this.direction === 'left') {
        ctx.fillRect(bodyX - p, bodyY + 2 * p + armSwing, p, p);
      } else if (this.direction === 'right') {
        ctx.fillRect(bodyX + bodyW, bodyY + 2 * p - armSwing, p, p);
      } else {
        ctx.fillRect(bodyX + bodyW, bodyY + 2 * p - armSwing, 2 * p, p);
      }

      // Blood drip trail (subtle)
      if (this.isMoving) {
        ctx.fillStyle = 'rgba(180,0,0,0.25)';
        const t = this.animTime;
        ctx.fillRect(cx + Math.sin(t * 3) * 2 * p, baseY + 9 * p, p, p);
      }
    }
  }

  // ════════════════════════════════════════════
  //  DOWN — facing camera (full frontal view)
  // ════════════════════════════════════════════
  private renderDown(
    ctx: CanvasRenderingContext2D, cx: number, baseY: number, p: number, frame: number,
    skinColor: string, skinShadow: string,
    bodyColor: string, bodyLight: string, bodyDark: string,
    legColor: string, legDark: string, shoeColor: string,
    hairColor: string, _hairDark: string,
  ): void {
    const headW = 5 * p;
    const headH = 4 * p;
    const bodyW = 6 * p;
    const bodyH = 4 * p;
    const legW = 2 * p;
    const legH = 3 * p;
    const armW = 2 * p;
    const armH = 4 * p;

    const headX = cx - Math.floor(headW / 2);
    const headY = baseY;
    const bodyX = cx - Math.floor(bodyW / 2);
    const bodyY = headY + headH;
    const legBaseY = bodyY + bodyH;
    const legSpread = p;

    const armSwing = this.isMoving ? (frame === 1 ? -p : frame === 3 ? p : 0) : 0;

    // ── Legs ──
    const drawLeg = (lx: number, ly: number, h: number) => {
      ctx.fillStyle = legColor;
      ctx.fillRect(lx, ly, legW, h);
      ctx.fillStyle = legDark;
      ctx.fillRect(lx, ly + Math.floor(h * 0.6), legW, p);
      ctx.fillStyle = shoeColor;
      ctx.fillRect(lx, ly + h - p, legW + p, p);
    };
    if (frame === 0 || frame === 2) {
      drawLeg(cx - legW - legSpread, legBaseY, legH);
      drawLeg(cx + legSpread, legBaseY, legH);
    } else if (frame === 1) {
      drawLeg(cx - legW - legSpread, legBaseY - p, legH);
      drawLeg(cx + legSpread, legBaseY + p, legH - p);
    } else {
      drawLeg(cx - legW - legSpread, legBaseY + p, legH - p);
      drawLeg(cx + legSpread, legBaseY - p, legH);
    }

    // ── Body (shirt) ──
    ctx.fillStyle = bodyColor;
    ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
    // Collar
    ctx.fillStyle = bodyLight;
    ctx.fillRect(bodyX + p, bodyY, bodyW - 2 * p, p);
    // Shoulder highlights
    ctx.fillStyle = bodyLight;
    ctx.fillRect(bodyX, bodyY, p, p);
    ctx.fillRect(bodyX + bodyW - p, bodyY, p, p);
    // Center zip/buttons
    ctx.fillStyle = bodyDark;
    ctx.fillRect(cx - Math.floor(p / 2), bodyY + p, p, bodyH - 2 * p);
    // Button dots
    ctx.fillStyle = bodyLight;
    ctx.fillRect(cx - Math.floor(p / 2), bodyY + 2 * p, p, Math.floor(p / 2));
    ctx.fillRect(cx - Math.floor(p / 2), bodyY + 3 * p, p, Math.floor(p / 2));
    // Bottom hem
    ctx.fillStyle = bodyDark;
    ctx.fillRect(bodyX, bodyY + bodyH - p, bodyW, p);

    // ── Arms ──
    // Left arm
    ctx.fillStyle = bodyColor;
    ctx.fillRect(bodyX - armW, bodyY + armSwing, armW, Math.floor(armH * 0.4));
    ctx.fillStyle = skinColor;
    ctx.fillRect(bodyX - armW, bodyY + Math.floor(armH * 0.4) + armSwing, armW, armH - Math.floor(armH * 0.4));
    ctx.fillStyle = skinShadow;
    ctx.fillRect(bodyX - armW, bodyY + armH - p + armSwing, armW, p);
    // Right arm
    ctx.fillStyle = bodyColor;
    ctx.fillRect(bodyX + bodyW, bodyY - armSwing, armW, Math.floor(armH * 0.4));
    ctx.fillStyle = skinColor;
    ctx.fillRect(bodyX + bodyW, bodyY + Math.floor(armH * 0.4) - armSwing, armW, armH - Math.floor(armH * 0.4));
    ctx.fillStyle = skinShadow;
    ctx.fillRect(bodyX + bodyW, bodyY + armH - p - armSwing, armW, p);

    // ── Head ──
    // Hair top
    ctx.fillStyle = hairColor;
    ctx.fillRect(headX, headY, headW, 2 * p);

    // Face skin
    ctx.fillStyle = skinColor;
    ctx.fillRect(headX, headY + p, headW, headH - p);
    // Chin shadow
    ctx.fillStyle = skinShadow;
    ctx.fillRect(headX + p, headY + headH - p, headW - 2 * p, p);

    // Hair overlay on top (over skin for correct layering)
    ctx.fillStyle = hairColor;
    ctx.fillRect(headX, headY, headW, 2 * p);
    // Side hair tufts
    if (this.characterId === 'dodger') {
      // Fenley: longer hair tufts extending down to headY + 3*p
      ctx.fillRect(headX, headY + p, p, 2 * p);
      ctx.fillRect(headX + headW - p, headY + p, p, 2 * p);
      // Ponytail: extra hair pixel extending 1p to the right of the head
      ctx.fillRect(headX + headW, headY + p, p, p);
    } else if (this.characterId === 'strong') {
      // David: buzz cut — minimal side hair
      ctx.fillRect(headX, headY + p, p, p);
      ctx.fillRect(headX + headW - p, headY + p, p, p);
    } else {
      ctx.fillRect(headX, headY + p, p, p);
      ctx.fillRect(headX + headW - p, headY + p, p, p);
    }

    // Eyebrows
    ctx.fillStyle = hairColor;
    if (this.characterId === 'strong') {
      // David: thicker eyebrows
      ctx.fillRect(headX + p, headY + p, 2 * p, p);
      ctx.fillRect(headX + headW - 3 * p, headY + p, 2 * p, p);
    } else {
      ctx.fillRect(headX + p, headY + p, 2 * p, Math.floor(p / 2));
      ctx.fillRect(headX + headW - 3 * p, headY + p, 2 * p, Math.floor(p / 2));
    }

    // Eyes
    const eyeRow = headY + 2 * p;
    // Eye whites
    ctx.fillStyle = '#fff';
    ctx.fillRect(headX + p, eyeRow, 2 * p, p);
    ctx.fillRect(headX + headW - 3 * p, eyeRow, 2 * p, p);
    // Pupils (looking forward)
    ctx.fillStyle = '#000';
    ctx.fillRect(headX + p + Math.floor(p / 2), eyeRow, p, p);
    ctx.fillRect(headX + headW - 3 * p + Math.floor(p / 2), eyeRow, p, p);

    // Eyelashes for Fenley (dodger)
    if (this.characterId === 'dodger') {
      ctx.fillStyle = hairColor;
      ctx.fillRect(headX + p, eyeRow - Math.floor(p / 2), p, Math.floor(p / 2));
      ctx.fillRect(headX + headW - 3 * p, eyeRow - Math.floor(p / 2), p, Math.floor(p / 2));
    }

    // Mouth
    ctx.fillStyle = skinShadow;
    if (this.characterId === 'dodger') {
      // Fenley: smaller/rounder mouth (1p wide)
      ctx.fillRect(cx - Math.floor(p / 2), headY + headH - 2 * p, p, Math.floor(p / 2));
    } else {
      ctx.fillRect(cx - p, headY + headH - 2 * p, 2 * p, Math.floor(p / 2));
    }

    // David: stubble/beard
    if (this.characterId === 'strong') {
      ctx.fillStyle = 'rgba(60,40,20,0.3)';
      ctx.fillRect(headX + p, headY + 3 * p, headW - 2 * p, p);
      ctx.fillRect(headX, headY + headH - p, headW, p);
    }
  }

  // ════════════════════════════════════════════
  //  UP — facing away (back view)
  // ════════════════════════════════════════════
  private renderUp(
    ctx: CanvasRenderingContext2D, cx: number, baseY: number, p: number, frame: number,
    skinColor: string, skinShadow: string,
    bodyColor: string, bodyLight: string, bodyDark: string,
    legColor: string, legDark: string, shoeColor: string,
    hairColor: string, hairDark: string,
  ): void {
    const headW = 5 * p;
    const headH = 4 * p;
    const bodyW = 6 * p;
    const bodyH = 4 * p;
    const legW = 2 * p;
    const legH = 3 * p;
    const armW = 2 * p;
    const armH = 4 * p;

    const headX = cx - Math.floor(headW / 2);
    const headY = baseY;
    const bodyX = cx - Math.floor(bodyW / 2);
    const bodyY = headY + headH;
    const legBaseY = bodyY + bodyH;
    const legSpread = p;

    const armSwing = this.isMoving ? (frame === 1 ? -p : frame === 3 ? p : 0) : 0;

    // ── Legs (from behind) ──
    const drawLeg = (lx: number, ly: number, h: number) => {
      ctx.fillStyle = legColor;
      ctx.fillRect(lx, ly, legW, h);
      // Back of knee shadow
      ctx.fillStyle = legDark;
      ctx.fillRect(lx, ly + Math.floor(h * 0.5), legW, p);
      // Shoe (no front extension from behind)
      ctx.fillStyle = shoeColor;
      ctx.fillRect(lx, ly + h - p, legW, p);
    };
    if (frame === 0 || frame === 2) {
      drawLeg(cx - legW - legSpread, legBaseY, legH);
      drawLeg(cx + legSpread, legBaseY, legH);
    } else if (frame === 1) {
      drawLeg(cx - legW - legSpread, legBaseY + p, legH - p);
      drawLeg(cx + legSpread, legBaseY - p, legH);
    } else {
      drawLeg(cx - legW - legSpread, legBaseY - p, legH);
      drawLeg(cx + legSpread, legBaseY + p, legH - p);
    }

    // ── Body (back of shirt/jacket) ──
    ctx.fillStyle = bodyColor;
    ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
    // Shoulder seam highlights
    ctx.fillStyle = bodyLight;
    ctx.fillRect(bodyX, bodyY, p, p);
    ctx.fillRect(bodyX + bodyW - p, bodyY, p, p);
    // Back center seam
    ctx.fillStyle = bodyDark;
    ctx.fillRect(cx - Math.floor(p / 2), bodyY + p, p, bodyH - p);
    // Bottom hem
    ctx.fillStyle = bodyDark;
    ctx.fillRect(bodyX, bodyY + bodyH - p, bodyW, p);

    // Backpack / detail on back
    ctx.fillStyle = bodyDark;
    ctx.fillRect(cx - p, bodyY + p, 2 * p, 2 * p);
    ctx.fillStyle = bodyLight;
    ctx.fillRect(cx - Math.floor(p / 2), bodyY + p, p, p);

    // ── Arms (from behind) ──
    // Left arm
    ctx.fillStyle = bodyColor;
    ctx.fillRect(bodyX - armW, bodyY - armSwing, armW, Math.floor(armH * 0.4));
    ctx.fillStyle = skinColor;
    ctx.fillRect(bodyX - armW, bodyY + Math.floor(armH * 0.4) - armSwing, armW, armH - Math.floor(armH * 0.4));
    ctx.fillStyle = skinShadow;
    ctx.fillRect(bodyX - armW, bodyY + armH - p - armSwing, armW, p);
    // Right arm
    ctx.fillStyle = bodyColor;
    ctx.fillRect(bodyX + bodyW, bodyY + armSwing, armW, Math.floor(armH * 0.4));
    ctx.fillStyle = skinColor;
    ctx.fillRect(bodyX + bodyW, bodyY + Math.floor(armH * 0.4) + armSwing, armW, armH - Math.floor(armH * 0.4));
    ctx.fillStyle = skinShadow;
    ctx.fillRect(bodyX + bodyW, bodyY + armH - p + armSwing, armW, p);

    // ── Head (back — hair covers everything, NO face) ──
    // Full hair coverage
    ctx.fillStyle = hairColor;
    ctx.fillRect(headX, headY, headW, headH);
    // Darker inner hair shading
    ctx.fillStyle = hairDark;
    ctx.fillRect(headX + p, headY + p, headW - 2 * p, headH - 2 * p);
    // Hair highlight on top
    ctx.fillStyle = hairColor;
    ctx.fillRect(headX + p, headY, headW - 2 * p, p);
    // Side hair extends down slightly
    ctx.fillRect(headX, headY + p, p, headH - p);
    ctx.fillRect(headX + headW - p, headY + p, p, headH - p);
    if (this.characterId === 'dodger') {
      // Fenley: longer side hair extends further down
      ctx.fillRect(headX, headY + headH, p, p);
      ctx.fillRect(headX + headW - p, headY + headH, p, p);
      // Ponytail visible on back (center-right, extends down)
      ctx.fillRect(cx, headY + headH, p, 2 * p);
      ctx.fillStyle = hairDark;
      ctx.fillRect(cx, headY + headH + p, p, p);
    }
    // Neck (tiny sliver at bottom)
    ctx.fillStyle = skinShadow;
    ctx.fillRect(cx - p, headY + headH, 2 * p, Math.floor(p / 2));
  }

  // ════════════════════════════════════════════
  //  LEFT / RIGHT — side profile
  // ════════════════════════════════════════════
  private renderSide(
    ctx: CanvasRenderingContext2D, cx: number, baseY: number, p: number, frame: number,
    facingRight: boolean,
    skinColor: string, skinShadow: string,
    bodyColor: string, bodyLight: string, bodyDark: string,
    legColor: string, legDark: string, shoeColor: string,
    hairColor: string, _hairDark: string,
  ): void {
    const dir = facingRight ? 1 : -1;

    const headW = 4 * p;  // narrower in profile
    const headH = 4 * p;
    const bodyW = 5 * p;  // narrower in profile
    const bodyH = 4 * p;
    const legW = 2 * p;
    const legH = 3 * p;
    const armW = 2 * p;
    const armH = 4 * p;

    const headX = cx - Math.floor(headW / 2);
    const headY = baseY;
    const bodyX = cx - Math.floor(bodyW / 2);
    const bodyY = headY + headH;
    const legBaseY = bodyY + bodyH;

    const armSwing = this.isMoving ? (frame === 1 ? -p : frame === 3 ? p : 0) : 0;

    // ── Legs (one in front, one behind for depth) ──
    // Back leg (drawn first, slightly offset away from facing dir)
    const backLegX = cx - Math.floor(legW / 2) - dir * Math.floor(p / 2);
    const frontLegX = cx - Math.floor(legW / 2) + dir * Math.floor(p / 2);

    const drawLeg = (lx: number, ly: number, h: number, isFront: boolean) => {
      ctx.fillStyle = isFront ? legColor : legDark;
      ctx.fillRect(lx, ly, legW, h);
      // Knee
      ctx.fillStyle = legDark;
      ctx.fillRect(lx, ly + Math.floor(h * 0.55), legW, p);
      // Shoe (extends forward in facing direction)
      ctx.fillStyle = shoeColor;
      if (facingRight) {
        ctx.fillRect(lx, ly + h - p, legW + p, p);
      } else {
        ctx.fillRect(lx - p, ly + h - p, legW + p, p);
      }
    };

    if (frame === 0 || frame === 2) {
      // Neutral — both legs together
      drawLeg(backLegX, legBaseY, legH, false);
      drawLeg(frontLegX, legBaseY, legH, true);
    } else if (frame === 1) {
      // Front leg forward (in facing dir), back leg back
      drawLeg(backLegX - dir * p, legBaseY + p, legH - p, false);
      drawLeg(frontLegX + dir * p, legBaseY - p, legH, true);
    } else {
      // Back leg forward, front leg back
      drawLeg(backLegX + dir * p, legBaseY - p, legH, false);
      drawLeg(frontLegX - dir * p, legBaseY + p, legH - p, true);
    }

    // ── Body (side view of shirt) ──
    ctx.fillStyle = bodyColor;
    ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
    // Shoulder highlight (on facing side)
    ctx.fillStyle = bodyLight;
    if (facingRight) {
      ctx.fillRect(bodyX + bodyW - p, bodyY, p, p);
    } else {
      ctx.fillRect(bodyX, bodyY, p, p);
    }
    // Side seam line
    ctx.fillStyle = bodyDark;
    const seamX = facingRight ? bodyX : bodyX + bodyW - p;
    ctx.fillRect(seamX, bodyY + p, p, bodyH - 2 * p);
    // Bottom hem
    ctx.fillStyle = bodyDark;
    ctx.fillRect(bodyX, bodyY + bodyH - p, bodyW, p);
    // Collar (visible on facing side)
    ctx.fillStyle = bodyLight;
    if (facingRight) {
      ctx.fillRect(bodyX + bodyW - 2 * p, bodyY, 2 * p, p);
    } else {
      ctx.fillRect(bodyX, bodyY, 2 * p, p);
    }

    // ── Back arm (behind body) ──
    const backArmX = facingRight ? bodyX - armW + p : bodyX + bodyW - p;
    ctx.fillStyle = bodyColor;
    ctx.fillRect(backArmX, bodyY - armSwing, armW, Math.floor(armH * 0.4));
    ctx.fillStyle = skinShadow;
    ctx.fillRect(backArmX, bodyY + Math.floor(armH * 0.4) - armSwing, armW, armH - Math.floor(armH * 0.4));

    // ── Front arm (in front of body) ──
    const frontArmX = facingRight ? bodyX + bodyW - p : bodyX - armW + p;
    ctx.fillStyle = bodyColor;
    ctx.fillRect(frontArmX, bodyY + armSwing, armW, Math.floor(armH * 0.4));
    ctx.fillStyle = skinColor;
    ctx.fillRect(frontArmX, bodyY + Math.floor(armH * 0.4) + armSwing, armW, armH - Math.floor(armH * 0.4));
    ctx.fillStyle = skinShadow;
    ctx.fillRect(frontArmX, bodyY + armH - p + armSwing, armW, p);

    // ── Head (profile) ──
    // Face skin
    ctx.fillStyle = skinColor;
    ctx.fillRect(headX, headY + p, headW, headH - p);

    // Nose bump (extends in facing direction)
    ctx.fillStyle = skinColor;
    if (facingRight) {
      ctx.fillRect(headX + headW, headY + 2 * p, p, p);
    } else {
      ctx.fillRect(headX - p, headY + 2 * p, p, p);
    }

    // Chin shadow
    ctx.fillStyle = skinShadow;
    ctx.fillRect(headX + p, headY + headH - p, headW - 2 * p, p);

    // Hair top
    ctx.fillStyle = hairColor;
    ctx.fillRect(headX, headY, headW, 2 * p);
    // Hair on back side of head
    if (facingRight) {
      ctx.fillRect(headX, headY, p, headH - p);
      if (this.characterId === 'dodger') {
        // Fenley: ponytail extends behind the head (left side when facing right)
        ctx.fillRect(headX - p, headY + p, p, 2 * p);
        // Longer hair tuft on back side
        ctx.fillRect(headX, headY + headH - p, p, p);
      }
    } else {
      ctx.fillRect(headX + headW - p, headY, p, headH - p);
      if (this.characterId === 'dodger') {
        // Fenley: ponytail extends behind the head (right side when facing left)
        ctx.fillRect(headX + headW, headY + p, p, 2 * p);
        // Longer hair tuft on back side
        ctx.fillRect(headX + headW - p, headY + headH - p, p, p);
      }
    }

    // Ear (on back side, visible in profile)
    ctx.fillStyle = skinShadow;
    if (facingRight) {
      ctx.fillRect(headX, headY + 2 * p, p, p);
    } else {
      ctx.fillRect(headX + headW - p, headY + 2 * p, p, p);
    }

    // Eyebrow
    ctx.fillStyle = hairColor;
    if (facingRight) {
      ctx.fillRect(headX + headW - 2 * p, headY + p, 2 * p, Math.floor(p / 2));
    } else {
      ctx.fillRect(headX, headY + p, 2 * p, Math.floor(p / 2));
    }

    // One eye (profile — only one visible)
    const eyeRow = headY + 2 * p;
    ctx.fillStyle = '#fff';
    if (facingRight) {
      ctx.fillRect(headX + headW - 2 * p, eyeRow, 2 * p, p);
      // Pupil (facing forward in profile)
      ctx.fillStyle = '#000';
      ctx.fillRect(headX + headW - p, eyeRow, p, p);
      // Eyelash for Fenley
      if (this.characterId === 'dodger') {
        ctx.fillStyle = hairColor;
        ctx.fillRect(headX + headW - 2 * p, eyeRow - Math.floor(p / 2), p, Math.floor(p / 2));
      }
    } else {
      ctx.fillRect(headX, eyeRow, 2 * p, p);
      // Pupil
      ctx.fillStyle = '#000';
      ctx.fillRect(headX, eyeRow, p, p);
      // Eyelash for Fenley
      if (this.characterId === 'dodger') {
        ctx.fillStyle = hairColor;
        ctx.fillRect(headX + p, eyeRow - Math.floor(p / 2), p, Math.floor(p / 2));
      }
    }

    // Mouth (small, on facing side)
    ctx.fillStyle = skinShadow;
    if (facingRight) {
      ctx.fillRect(headX + headW - p, headY + 3 * p, p, Math.floor(p / 2));
    } else {
      ctx.fillRect(headX, headY + 3 * p, p, Math.floor(p / 2));
    }

    // David: stubble on jaw in profile
    if (this.characterId === 'strong') {
      ctx.fillStyle = 'rgba(60,40,20,0.3)';
      if (facingRight) {
        ctx.fillRect(headX + headW - p, headY + 3 * p, p, p);
      } else {
        ctx.fillRect(headX, headY + 3 * p, p, p);
      }
      ctx.fillRect(headX + p, headY + headH - p, headW - 2 * p, p);
    }
  }
}
