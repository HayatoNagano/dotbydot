import { Vector2 } from '../types';

let nextId = 0;

export class Entity {
  readonly id: number;
  pos: Vector2;
  width: number;
  height: number;

  constructor(x: number, y: number, width: number, height: number) {
    this.id = nextId++;
    this.pos = { x, y };
    this.width = width;
    this.height = height;
  }

  get centerX(): number {
    return this.pos.x + this.width / 2;
  }

  get centerY(): number {
    return this.pos.y + this.height / 2;
  }
}
