import { Ability } from './Ability';
import { Character } from '../entities/Character';
import { Trap } from '../entities/Trap';
import { TILE_SIZE } from '../constants';

export class TrapAbility extends Ability {
  private character: Character;
  readonly traps: Trap[] = [];
  private static readonly MAX_TRAPS = 2;

  constructor(character: Character) {
    super('Bear Trap', 20, 0);
    this.character = character;
  }

  protected onActivate(): void {
    // Remove oldest trap if at max
    if (this.traps.length >= TrapAbility.MAX_TRAPS) {
      this.traps.shift();
    }

    const trap = new Trap(
      this.character.centerX - TILE_SIZE * 0.3,
      this.character.centerY - TILE_SIZE * 0.3,
    );
    this.traps.push(trap);
  }

  protected onUpdate(_dt: number): void {}
  protected onDeactivate(): void {}
}
