import { TILE_SIZE } from '../constants';

interface ScratchMark {
  x: number;
  y: number;
  age: number;
}

export class ScratchMarks {
  private marks: ScratchMark[] = [];
  private static readonly MAX_AGE = 6; // seconds
  private static readonly SPAWN_INTERVAL = 0.3; // seconds
  private spawnTimer = 0;

  update(dt: number, playerX: number, playerY: number, isRunning: boolean): void {
    // Age existing marks
    for (let i = this.marks.length - 1; i >= 0; i--) {
      this.marks[i].age += dt;
      if (this.marks[i].age >= ScratchMarks.MAX_AGE) {
        this.marks.splice(i, 1);
      }
    }

    // Add new marks when running
    if (isRunning) {
      this.spawnTimer += dt;
      if (this.spawnTimer >= ScratchMarks.SPAWN_INTERVAL) {
        this.spawnTimer = 0;
        this.marks.push({
          x: playerX + (Math.random() - 0.5) * 4,
          y: playerY + (Math.random() - 0.5) * 4,
          age: 0,
        });
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number): void {
    for (const mark of this.marks) {
      const alpha = 1 - mark.age / ScratchMarks.MAX_AGE;
      ctx.fillStyle = `rgba(200, 50, 50, ${alpha * 0.6})`;
      ctx.fillRect(mark.x - cameraX - 1, mark.y - cameraY - 1, 3, 3);
    }
  }

  get allMarks(): ReadonlyArray<ScratchMark> {
    return this.marks;
  }
}
