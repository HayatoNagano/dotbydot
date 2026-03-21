import { TILE_SIZE } from '../constants';

interface ScratchMark {
  x: number;
  y: number;
  age: number;
}

/** Info about a running survivor for scratch mark generation */
export interface ScratchMarkRunner {
  x: number;
  y: number;
  isRunning: boolean;
}

export class ScratchMarks {
  private marks: ScratchMark[] = [];
  private static readonly MAX_AGE = 6; // seconds
  private static readonly SPAWN_INTERVAL = 0.3; // seconds
  private spawnTimers: number[] = [];

  /** Update scratch marks for multiple survivors */
  update(dt: number, runners: ScratchMarkRunner[]): void {
    // Age existing marks
    for (let i = this.marks.length - 1; i >= 0; i--) {
      this.marks[i].age += dt;
      if (this.marks[i].age >= ScratchMarks.MAX_AGE) {
        this.marks.splice(i, 1);
      }
    }

    // Ensure we have enough timers
    while (this.spawnTimers.length < runners.length) {
      this.spawnTimers.push(0);
    }

    // Add new marks for each running survivor
    for (let i = 0; i < runners.length; i++) {
      const r = runners[i];
      if (r.isRunning) {
        this.spawnTimers[i] += dt;
        if (this.spawnTimers[i] >= ScratchMarks.SPAWN_INTERVAL) {
          this.spawnTimers[i] = 0;
          this.marks.push({
            x: r.x + (Math.random() - 0.5) * TILE_SIZE * 0.5,
            y: r.y + (Math.random() - 0.5) * TILE_SIZE * 0.5,
            age: 0,
          });
        }
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number): void {
    const s = Math.floor(TILE_SIZE / 5);
    for (const mark of this.marks) {
      const alpha = 1 - mark.age / ScratchMarks.MAX_AGE;
      ctx.fillStyle = `rgba(200, 50, 50, ${alpha * 0.6})`;
      const sx = mark.x - cameraX - Math.floor(s / 2);
      const sy = mark.y - cameraY - Math.floor(s / 2);
      // Claw scratch pattern
      ctx.fillRect(sx, sy, s, 1);
      ctx.fillRect(sx + 1, sy + 1, s - 1, 1);
      ctx.fillRect(sx, sy + 2, s, 1);
    }
  }

  get allMarks(): ReadonlyArray<ScratchMark> {
    return this.marks;
  }
}
