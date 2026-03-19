import { Entity } from '../entities/Entity';

export class CollisionSystem {
  static overlaps(a: Entity, b: Entity): boolean {
    return (
      a.pos.x < b.pos.x + b.width &&
      a.pos.x + a.width > b.pos.x &&
      a.pos.y < b.pos.y + b.height &&
      a.pos.y + a.height > b.pos.y
    );
  }

  static distance(a: Entity, b: Entity): number {
    const dx = a.centerX - b.centerX;
    const dy = a.centerY - b.centerY;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
