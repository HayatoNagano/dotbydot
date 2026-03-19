export class SkillCheck {
  active = false;
  /** Cursor position 0..1 rotating around */
  cursor = 0;
  /** Target zone start 0..1 */
  targetStart = 0;
  /** Target zone width */
  targetWidth = 0.15;
  /** Great skill check zone (smaller, inside target) */
  greatStart = 0;
  greatWidth = 0.05;

  private speed = 1.5; // rotations per second
  private result: 'none' | 'great' | 'good' | 'miss' = 'none';
  private resultTimer = 0;
  private static readonly RESULT_DISPLAY_TIME = 0.5;

  /** Start a new skill check */
  trigger(): void {
    if (this.active) return;
    this.active = true;
    this.cursor = 0;
    this.targetStart = 0.3 + Math.random() * 0.4;
    this.greatStart = this.targetStart + (this.targetWidth - this.greatWidth) * Math.random();
    this.result = 'none';
    this.resultTimer = 0;
  }

  /** Player presses the skill check button */
  hit(): 'great' | 'good' | 'miss' {
    if (!this.active) return 'miss';

    const c = this.cursor;
    if (c >= this.greatStart && c <= this.greatStart + this.greatWidth) {
      this.result = 'great';
    } else if (c >= this.targetStart && c <= this.targetStart + this.targetWidth) {
      this.result = 'good';
    } else {
      this.result = 'miss';
    }

    this.active = false;
    this.resultTimer = SkillCheck.RESULT_DISPLAY_TIME;
    return this.result;
  }

  update(dt: number): void {
    if (this.active) {
      this.cursor += this.speed * dt;
      if (this.cursor > 1) {
        // Missed - cursor went all the way around
        this.result = 'miss';
        this.active = false;
        this.resultTimer = SkillCheck.RESULT_DISPLAY_TIME;
      }
    }

    if (this.resultTimer > 0) {
      this.resultTimer -= dt;
    }
  }

  get isShowingResult(): boolean {
    return this.resultTimer > 0;
  }

  get lastResult(): 'none' | 'great' | 'good' | 'miss' {
    return this.result;
  }

  /** Returns skill check bonus for repair speed: great=0.5, good=0.1, miss=-0.2 */
  get repairBonus(): number {
    switch (this.result) {
      case 'great': return 0.5;
      case 'good': return 0.1;
      case 'miss': return -0.2;
      default: return 0;
    }
  }

  render(ctx: CanvasRenderingContext2D, centerX: number, centerY: number): void {
    const radius = 40;
    const lineWidth = 8;

    if (!this.active && !this.isShowingResult) return;

    ctx.save();
    ctx.translate(centerX, centerY);

    // Background circle
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    if (this.active) {
      // Target zone
      const tStart = this.targetStart * Math.PI * 2 - Math.PI / 2;
      const tEnd = (this.targetStart + this.targetWidth) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius, tStart, tEnd);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = lineWidth;
      ctx.stroke();

      // Great zone
      const gStart = this.greatStart * Math.PI * 2 - Math.PI / 2;
      const gEnd = (this.greatStart + this.greatWidth) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius, gStart, gEnd);
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = lineWidth;
      ctx.stroke();

      // Cursor
      const angle = this.cursor * Math.PI * 2 - Math.PI / 2;
      const cx = Math.cos(angle) * radius;
      const cy = Math.sin(angle) * radius;
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4444';
      ctx.fill();
    }

    // Result text
    if (this.isShowingResult) {
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      switch (this.result) {
        case 'great':
          ctx.fillStyle = '#ffff00';
          ctx.fillText('GREAT!', 0, 4);
          break;
        case 'good':
          ctx.fillStyle = '#ffffff';
          ctx.fillText('GOOD', 0, 4);
          break;
        case 'miss':
          ctx.fillStyle = '#ff4444';
          ctx.fillText('MISS', 0, 4);
          break;
      }
      ctx.textAlign = 'left';
    }

    ctx.restore();
  }
}
