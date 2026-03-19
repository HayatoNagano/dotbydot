export interface AIController {
  update(dt: number): { dx: number; dy: number; interact: boolean; ability: boolean; walk: boolean };
}
