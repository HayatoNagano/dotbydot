import { TileType } from '../types';
import { MAP_COLS, MAP_ROWS, TILE_SIZE } from '../constants';

export class TileMap {
  readonly cols = MAP_COLS;
  readonly rows = MAP_ROWS;
  readonly tileSize = TILE_SIZE;
  readonly tiles: TileType[];
  readonly seed = 42;

  constructor() {
    this.tiles = new Array(this.cols * this.rows).fill(TileType.Floor);
    this.generateSimpleMap();
  }

  private generateSimpleMap(): void {
    // Border walls
    for (let x = 0; x < this.cols; x++) {
      this.set(x, 0, TileType.Wall);
      this.set(x, this.rows - 1, TileType.Wall);
    }
    for (let y = 0; y < this.rows; y++) {
      this.set(0, y, TileType.Wall);
      this.set(this.cols - 1, y, TileType.Wall);
    }

    // Interior walls: rooms and corridors
    this.generateRooms();
  }

  private generateRooms(): void {
    const rng = this.seededRandom(42);

    // Create a grid of rooms with corridors
    const roomSize = 8;
    const wallThickness = 1;

    for (let ry = 0; ry < Math.floor(this.rows / roomSize); ry++) {
      for (let rx = 0; rx < Math.floor(this.cols / roomSize); rx++) {
        const baseX = rx * roomSize;
        const baseY = ry * roomSize;

        // Draw room walls on right and bottom edges
        if (rx < Math.floor(this.cols / roomSize) - 1) {
          const wallX = baseX + roomSize - wallThickness;
          for (let y = baseY; y < baseY + roomSize && y < this.rows; y++) {
            if (wallX > 0 && wallX < this.cols - 1) {
              this.set(wallX, y, TileType.Wall);
            }
          }
          // Door opening
          const doorY = baseY + 2 + Math.floor(rng() * (roomSize - 4));
          if (doorY > 0 && doorY < this.rows - 1) {
            this.set(wallX, doorY, TileType.Floor);
            if (doorY + 1 < this.rows - 1) {
              this.set(wallX, doorY + 1, TileType.Floor);
            }
          }
        }

        if (ry < Math.floor(this.rows / roomSize) - 1) {
          const wallY = baseY + roomSize - wallThickness;
          for (let x = baseX; x < baseX + roomSize && x < this.cols; x++) {
            if (wallY > 0 && wallY < this.rows - 1) {
              this.set(x, wallY, TileType.Wall);
            }
          }
          // Door opening
          const doorX = baseX + 2 + Math.floor(rng() * (roomSize - 4));
          if (doorX > 0 && doorX < this.cols - 1) {
            this.set(doorX, wallY, TileType.Floor);
            if (doorX + 1 < this.cols - 1) {
              this.set(doorX + 1, wallY, TileType.Floor);
            }
          }
        }

        // Random obstacles inside rooms
        if (rng() > 0.5) {
          const ox = baseX + 2 + Math.floor(rng() * 3);
          const oy = baseY + 2 + Math.floor(rng() * 3);
          if (ox > 1 && ox < this.cols - 2 && oy > 1 && oy < this.rows - 2) {
            this.set(ox, oy, TileType.Wall);
            if (rng() > 0.5 && ox + 1 < this.cols - 2) {
              this.set(ox + 1, oy, TileType.Wall);
            }
          }
        }
      }
    }
  }

  private seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
  }

  get(x: number, y: number): TileType {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return TileType.Wall;
    return this.tiles[y * this.cols + x];
  }

  set(x: number, y: number, tile: TileType): void {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return;
    this.tiles[y * this.cols + x] = tile;
  }

  isWalkable(x: number, y: number): boolean {
    return this.get(x, y) === TileType.Floor;
  }

  /** Check if a pixel-space AABB overlaps any wall tile */
  collidesRect(px: number, py: number, w: number, h: number): boolean {
    const x0 = Math.floor(px / this.tileSize);
    const y0 = Math.floor(py / this.tileSize);
    const x1 = Math.floor((px + w - 0.01) / this.tileSize);
    const y1 = Math.floor((py + h - 0.01) / this.tileSize);

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!this.isWalkable(tx, ty)) return true;
      }
    }
    return false;
  }

  get widthPx(): number {
    return this.cols * this.tileSize;
  }
  get heightPx(): number {
    return this.rows * this.tileSize;
  }
}
