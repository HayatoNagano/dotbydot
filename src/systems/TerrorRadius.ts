import { TERROR_RADIUS, TILE_SIZE } from '../constants';

export class TerrorRadius {
  /** Returns 0-1 intensity based on distance (1 = closest, 0 = out of range) */
  static getIntensity(
    killerX: number,
    killerY: number,
    survivorX: number,
    survivorY: number,
  ): number {
    const dx = killerX - survivorX;
    const dy = killerY - survivorY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = TERROR_RADIUS * TILE_SIZE;

    if (dist >= maxDist) return 0;
    return 1 - dist / maxDist;
  }

  /** Render terror radius visual effect on survivor's screen */
  static renderEffect(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    viewportWidth: number,
    viewportHeight: number,
  ): void {
    if (intensity <= 0) return;

    // Red vignette effect
    const alpha = intensity * 0.3;
    const gradient = ctx.createRadialGradient(
      viewportWidth / 2,
      viewportHeight / 2,
      viewportWidth * 0.3,
      viewportWidth / 2,
      viewportHeight / 2,
      viewportWidth * 0.7,
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, `rgba(180, 0, 0, ${alpha})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);

    // Pulsing heartbeat overlay at high intensity
    if (intensity > 0.5) {
      const pulse = Math.sin(Date.now() / (200 - intensity * 100)) * 0.5 + 0.5;
      const pulseAlpha = (intensity - 0.5) * 2 * pulse * 0.15;
      ctx.fillStyle = `rgba(255, 0, 0, ${pulseAlpha})`;
      ctx.fillRect(0, 0, viewportWidth, viewportHeight);
    }
  }
}
