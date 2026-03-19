import { describe, it, expect } from 'vitest';
import { FogOfWar } from '../world/FogOfWar';
import { TileMap } from '../world/TileMap';
import { TILE_SIZE } from '../constants';

describe('FogOfWar', () => {
  it('reveals tiles around player position', () => {
    const map = new TileMap();
    const fog = new FogOfWar(map, 4);

    // Position at a known walkable tile (search for one)
    let px = 0, py = 0;
    for (let y = 1; y < 10; y++) {
      for (let x = 1; x < 10; x++) {
        if (map.isWalkable(x, y)) {
          px = x * TILE_SIZE + TILE_SIZE / 2;
          py = y * TILE_SIZE + TILE_SIZE / 2;
          break;
        }
      }
      if (px > 0) break;
    }

    fog.update(px, py);

    const tileX = Math.floor(px / TILE_SIZE);
    const tileY = Math.floor(py / TILE_SIZE);

    // Player's own tile should be visible
    expect(fog.isVisible(tileX, tileY)).toBe(true);
  });

  it('does not reveal tiles far away', () => {
    const map = new TileMap();
    const fog = new FogOfWar(map, 4);

    fog.update(5 * TILE_SIZE, 5 * TILE_SIZE);

    // Tile far away should not be visible
    expect(fog.isVisible(40, 40)).toBe(false);
  });

  it('only recalculates when tile position changes', () => {
    const map = new TileMap();
    const fog = new FogOfWar(map, 4);

    fog.update(5 * TILE_SIZE + 1, 5 * TILE_SIZE + 1);
    const snapshot1 = [...fog.visible];

    // Small sub-tile movement should not recalculate
    fog.update(5 * TILE_SIZE + 2, 5 * TILE_SIZE + 2);
    expect(fog.visible).toEqual(snapshot1);
  });
});
