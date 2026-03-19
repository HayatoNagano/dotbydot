import { Ability } from './Ability';
import { Character } from '../entities/Character';
import { Axe } from '../entities/Axe';

export class ThrowAxe extends Ability {
  private character: Character;
  readonly axes: Axe[] = [];

  constructor(character: Character) {
    super('Throw Axe', 10, 0);
    this.character = character;
  }

  protected onActivate(): void {
    const axe = new Axe(
      this.character.centerX - 3,
      this.character.centerY - 3,
      this.character.direction,
    );
    this.axes.push(axe);
  }

  protected onUpdate(_dt: number): void {}
  protected onDeactivate(): void {}

  /** Remove dead axes */
  cleanup(): void {
    for (let i = this.axes.length - 1; i >= 0; i--) {
      if (!this.axes[i].alive) this.axes.splice(i, 1);
    }
  }
}
