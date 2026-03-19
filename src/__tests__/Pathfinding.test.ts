import { describe, it, expect } from 'vitest';
import { Pathfinding } from '../world/Pathfinding';
import { TileMap } from '../world/TileMap';

describe('Pathfinding', () => {
  it('finds a path between two walkable tiles', () => {
    const map = new TileMap();
    const pf = new Pathfinding(map);

    // Find two walkable tiles
    let start: { x: number; y: number } | null = null;
    let end: { x: number; y: number } | null = null;

    for (let y = 1; y < 10; y++) {
      for (let x = 1; x < 10; x++) {
        if (map.isWalkable(x, y)) {
          if (!start) start = { x, y };
          else if (!end) end = { x, y };
        }
      }
    }

    expect(start).not.toBeNull();
    expect(end).not.toBeNull();

    const path = pf.findPath(start!.x, start!.y, end!.x, end!.y);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(0);
    // Path should end at goal
    expect(path![path!.length - 1]).toEqual(end);
  });

  it('returns null for unreachable target', () => {
    const map = new TileMap();
    const pf = new Pathfinding(map);
    // Target inside a wall
    const path = pf.findPath(2, 2, 0, 0);
    expect(path).toBeNull();
  });
});
