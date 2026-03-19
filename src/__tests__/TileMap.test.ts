import { describe, it, expect } from 'vitest';
import { TileMap } from '../world/TileMap';
import { TileType } from '../types';

describe('TileMap', () => {
  it('creates a map with correct dimensions', () => {
    const map = new TileMap();
    expect(map.cols).toBe(50);
    expect(map.rows).toBe(50);
  });

  it('has walls on borders', () => {
    const map = new TileMap();
    expect(map.get(0, 0)).toBe(TileType.Wall);
    expect(map.get(49, 0)).toBe(TileType.Wall);
    expect(map.get(0, 49)).toBe(TileType.Wall);
    expect(map.get(49, 49)).toBe(TileType.Wall);
  });

  it('returns Wall for out-of-bounds', () => {
    const map = new TileMap();
    expect(map.get(-1, 0)).toBe(TileType.Wall);
    expect(map.get(50, 0)).toBe(TileType.Wall);
  });

  it('detects walkable tiles correctly', () => {
    const map = new TileMap();
    expect(map.isWalkable(0, 0)).toBe(false); // border wall
    // Interior should have some walkable tiles
    let hasFloor = false;
    for (let y = 1; y < 49; y++) {
      for (let x = 1; x < 49; x++) {
        if (map.isWalkable(x, y)) {
          hasFloor = true;
          break;
        }
      }
      if (hasFloor) break;
    }
    expect(hasFloor).toBe(true);
  });

  it('collidesRect detects wall collision', () => {
    const map = new TileMap();
    // Top-left corner is wall
    expect(map.collidesRect(0, 0, 16, 16)).toBe(true);
  });
});
