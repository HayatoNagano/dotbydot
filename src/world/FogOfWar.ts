import { TileMap } from './TileMap';

export class FogOfWar {
  readonly visible: boolean[];
  private lastTileX = -1;
  private lastTileY = -1;

  constructor(
    private map: TileMap,
    private radius: number,
  ) {
    this.visible = new Array(map.cols * map.rows).fill(false);
  }

  /** Recalculate visibility from a pixel position. Only recomputes when tile changes. */
  update(px: number, py: number): void {
    const tileX = Math.floor(px / this.map.tileSize);
    const tileY = Math.floor(py / this.map.tileSize);

    if (tileX === this.lastTileX && tileY === this.lastTileY) return;
    this.lastTileX = tileX;
    this.lastTileY = tileY;

    // Clear
    this.visible.fill(false);

    // BFS flood fill with line-of-sight check
    const r = this.radius;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const tx = tileX + dx;
        const ty = tileY + dy;
        if (tx < 0 || tx >= this.map.cols || ty < 0 || ty >= this.map.rows) continue;

        if (this.hasLineOfSight(tileX, tileY, tx, ty)) {
          this.visible[ty * this.map.cols + tx] = true;
        }
      }
    }
  }

  isVisible(tileX: number, tileY: number): boolean {
    if (tileX < 0 || tileX >= this.map.cols || tileY < 0 || tileY >= this.map.rows) return false;
    return this.visible[tileY * this.map.cols + tileX];
  }

  /** Bresenham line-of-sight check */
  private hasLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let cx = x0;
    let cy = y0;

    while (true) {
      // Allow seeing walls but not through them
      if (cx !== x0 || cy !== y0) {
        if (!this.map.isWalkable(cx, cy)) {
          // Can see the wall tile itself, but stop here
          return cx === x1 && cy === y1;
        }
      }

      if (cx === x1 && cy === y1) return true;

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }
    }
  }
}
