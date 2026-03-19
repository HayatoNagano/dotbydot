import { TileMap } from './TileMap';

interface Node {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: Node | null;
}

export class Pathfinding {
  private map: TileMap;

  constructor(map: TileMap) {
    this.map = map;
  }

  /** A* pathfinding. Returns array of tile positions from start to goal (excluding start). */
  findPath(
    startX: number,
    startY: number,
    goalX: number,
    goalY: number,
    maxNodes = 500,
  ): { x: number; y: number }[] | null {
    const open: Node[] = [];
    const closed = new Set<number>();
    const key = (x: number, y: number) => y * this.map.cols + x;

    const startNode: Node = {
      x: startX, y: startY,
      g: 0, h: this.heuristic(startX, startY, goalX, goalY),
      f: 0, parent: null,
    };
    startNode.f = startNode.g + startNode.h;
    open.push(startNode);

    let nodesExplored = 0;

    while (open.length > 0 && nodesExplored < maxNodes) {
      // Find node with lowest f
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) bestIdx = i;
      }
      const current = open.splice(bestIdx, 1)[0];
      nodesExplored++;

      if (current.x === goalX && current.y === goalY) {
        return this.reconstructPath(current);
      }

      closed.add(key(current.x, current.y));

      // Neighbors (4-directional)
      const neighbors = [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 },
      ];

      for (const n of neighbors) {
        if (!this.map.isWalkable(n.x, n.y)) continue;
        if (closed.has(key(n.x, n.y))) continue;

        const g = current.g + 1;
        const existing = open.find((o) => o.x === n.x && o.y === n.y);

        if (existing) {
          if (g < existing.g) {
            existing.g = g;
            existing.f = g + existing.h;
            existing.parent = current;
          }
        } else {
          const h = this.heuristic(n.x, n.y, goalX, goalY);
          open.push({ x: n.x, y: n.y, g, h, f: g + h, parent: current });
        }
      }
    }

    return null; // No path found
  }

  private heuristic(x0: number, y0: number, x1: number, y1: number): number {
    return Math.abs(x0 - x1) + Math.abs(y0 - y1);
  }

  private reconstructPath(node: Node): { x: number; y: number }[] {
    const path: { x: number; y: number }[] = [];
    let current: Node | null = node;
    while (current?.parent) {
      path.unshift({ x: current.x, y: current.y });
      current = current.parent;
    }
    return path;
  }
}
