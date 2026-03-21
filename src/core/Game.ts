import { TileMap } from '../world/TileMap';
import { FogOfWar } from '../world/FogOfWar';
import { Survivor } from '../entities/Survivor';
import { Killer } from '../entities/Killer';
import { Pallet } from '../entities/Pallet';
import { Locker } from '../entities/Locker';
import { Generator } from '../entities/Generator';
import { Hook } from '../entities/Hook';
import { ExitGate } from '../entities/ExitGate';
import { Trap } from '../entities/Trap';
import { Axe } from '../entities/Axe';
import { Character } from '../entities/Character';
import { Camera } from './Camera';
import { Input } from './Input';
import { Renderer, RenderView, WorldObjects } from '../rendering/Renderer';
import { ScratchMarks, ScratchMarkRunner } from '../systems/ScratchMarks';
import { CollisionSystem } from '../systems/CollisionSystem';
import { SkillCheck } from '../ui/SkillCheck';
import { Ability } from '../abilities/Ability';
import { SprintBurst } from '../abilities/SprintBurst';
import { KillerAI } from '../ai/KillerAI';
import { SurvivorAI } from '../ai/SurvivorAI';
import { AIController } from '../ai/AIController';
import { DeadHard } from '../abilities/DeadHard';
import { TrapAbility } from '../abilities/TrapAbility';
import { ThrowAxe } from '../abilities/ThrowAxe';
import { eventBus } from './EventBus';
import { HealthState, GamePhase } from '../types';
import { NetInput } from '../net/protocol';
import { MenuSelection, GameMode, PlayerRole } from '../ui/Menu';
import { audioManager } from '../audio/AudioManager';
import { TerrorRadius } from '../systems/TerrorRadius';
import { InfoPanel } from '../ui/InfoPanel';
import {
  TILE_SIZE,
  FOG_RADIUS_SURVIVOR,
  FOG_RADIUS_KILLER,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GAME_HEIGHT,
  GENERATORS_ON_MAP,
  GENERATORS_TO_POWER,
  KILLER_BASE_SPEED,
  SURVIVOR_RUN_SPEED,
} from '../constants';

export class Game {
  readonly map: TileMap;
  /** Primary survivor (player-controlled in survivor mode) */
  readonly survivor: Survivor;
  /** Second survivor (always bot-controlled) */
  readonly survivor2: Survivor;
  /** All survivors for iteration */
  readonly survivors: Survivor[];
  /** The survivor controlled by the local player (set by OnlineGame for guest2) */
  localSurvivor: Survivor;
  readonly killer: Killer;
  readonly pallets: Pallet[] = [];
  readonly lockers: Locker[] = [];
  readonly generators: Generator[] = [];
  readonly hooks: Hook[] = [];
  readonly exitGates: ExitGate[] = [];
  readonly traps: Trap[] = [];
  readonly axes: Axe[] = [];
  readonly survivorFog: FogOfWar;
  readonly killerFog: FogOfWar;
  readonly survivorCamera: Camera;
  readonly killerCamera: Camera;
  readonly input: Input;
  readonly renderer: Renderer;
  readonly scratchMarks: ScratchMarks;
  /** Per-survivor skill checks */
  readonly skillCheck1: SkillCheck;
  readonly skillCheck2: SkillCheck;
  readonly infoPanel: InfoPanel;
  readonly selection: MenuSelection;

  survivorAbility: Ability | null = null;
  survivor2Ability: Ability | null = null;
  killerAbility: Ability | null = null;
  private trapAbility: TrapAbility | null = null;
  private throwAxe: ThrowAxe | null = null;
  private deadHard: DeadHard | null = null;
  private deadHard2: DeadHard | null = null;

  phase: GamePhase = GamePhase.Playing;
  generatorsCompleted = 0;
  gatesPowered = false;
  isRepairing = false;

  private skillCheckTimer1 = 0;
  private skillCheckTimer2 = 0;
  private repairTickTimer = 0;
  private prevSurvivorHealth: HealthState = HealthState.Healthy;
  private prevPhase: GamePhase = GamePhase.Playing;
  private prevGatesPowered = false;
  inChase = false;
  private chaseCooldown = 0;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly playerRole: PlayerRole;
  private killerAI: KillerAI | null = null;
  private survivorAI: SurvivorAI | null = null;
  /** AI for the 2nd survivor (always bot-controlled unless a 2nd guest joins) */
  private survivor2AI: SurvivorAI | null = null;
  /** If set, a human guest is controlling survivor1 instead of AI */
  guest1Input: NetInput | null = null;
  /** If set, a human guest is controlling survivor2 instead of AI */
  guest2Input: NetInput | null = null;
  /** Timer for killer kicking a generator (1 second action) */
  private kickingGen: Generator | null = null;
  private kickTimer = 0;
  private static readonly KICK_DURATION = 1.0;

  constructor(canvas: HTMLCanvasElement, input: Input, selection: MenuSelection) {
    this.selection = selection;
    this.playerRole = selection.playerRole;

    this.viewportWidth = CANVAS_WIDTH;
    this.viewportHeight = GAME_HEIGHT;
    this.map = new TileMap();
    this.input = input;
    this.renderer = new Renderer(canvas, CANVAS_WIDTH, CANVAS_HEIGHT);
    this.scratchMarks = new ScratchMarks();
    this.skillCheck1 = new SkillCheck();
    this.skillCheck2 = new SkillCheck();
    this.infoPanel = new InfoPanel();

    // Spawn positions — survivors on opposite corners, killer in center-bottom
    const s1Spawn = this.findWalkableSpawn(5, 5);
    const s2Spawn = this.findWalkableSpawn(this.map.cols - 6, 5);
    const kSpawn = this.findWalkableSpawn(this.map.cols - 6, this.map.rows - 6);

    this.survivor = new Survivor(s1Spawn.x * TILE_SIZE + 2, s1Spawn.y * TILE_SIZE + 2);
    this.survivor.color = selection.survivorDef.color;
    this.survivor.characterId = selection.survivorDef.id;

    this.survivor2 = new Survivor(s2Spawn.x * TILE_SIZE + 2, s2Spawn.y * TILE_SIZE + 2);
    this.survivor2.color = selection.survivor2Def.color;
    this.survivor2.characterId = selection.survivor2Def.id;

    this.survivors = [this.survivor, this.survivor2];
    this.localSurvivor = this.survivor;

    this.killer = new Killer(kSpawn.x * TILE_SIZE + 2, kSpawn.y * TILE_SIZE + 2);
    this.killer.color = selection.killerDef.color;
    this.killer.characterId = selection.killerDef.id;

    // Setup abilities
    this.setupAbilities(selection);

    this.survivorFog = new FogOfWar(this.map, FOG_RADIUS_SURVIVOR);
    this.killerFog = new FogOfWar(this.map, FOG_RADIUS_KILLER);

    this.survivorCamera = new Camera(this.viewportWidth, this.viewportHeight, this.map.widthPx, this.map.heightPx);
    this.killerCamera = new Camera(this.viewportWidth, this.viewportHeight, this.map.widthPx, this.map.heightPx);

    this.placeObjects();

    // Setup AI
    if (selection.mode === GameMode.VsCPU) {
      if (this.playerRole === PlayerRole.Survivor) {
        // Player is survivor1, AI controls killer + survivor2
        this.killerAI = new KillerAI(
          this.killer, this.survivors, this.map, this.killerFog,
          this.scratchMarks, this.hooks, this.generators,
        );
        this.survivor2AI = new SurvivorAI(
          this.survivor2, this.killer, this.map, this.survivorFog,
          this.generators, this.exitGates, this.hooks, this.lockers,
          () => this.gatesPowered,
        );
      } else {
        // Player is killer, AI controls both survivors
        this.survivorAI = new SurvivorAI(
          this.survivor, this.killer, this.map, this.survivorFog,
          this.generators, this.exitGates, this.hooks, this.lockers,
          () => this.gatesPowered,
        );
        this.survivor2AI = new SurvivorAI(
          this.survivor2, this.killer, this.map, this.survivorFog,
          this.generators, this.exitGates, this.hooks, this.lockers,
          () => this.gatesPowered,
        );
      }
    } else if (selection.mode === GameMode.Online) {
      // Online: host=survivor1, guest=killer, survivor2=AI always
      this.survivor2AI = new SurvivorAI(
        this.survivor2, this.killer, this.map, this.survivorFog,
        this.generators, this.exitGates, this.hooks, this.lockers,
        () => this.gatesPowered,
      );
    }

    eventBus.on('generator_completed', () => {
      this.generatorsCompleted++;
      audioManager.playGeneratorComplete();
      if (this.generatorsCompleted >= GENERATORS_TO_POWER) {
        this.gatesPowered = true;
        for (const gate of this.exitGates) gate.powerOn();
      }
    });

    eventBus.on('survivor_sacrificed', () => {
      audioManager.playSacrifice();
    });
  }

  private setupAbilities(selection: MenuSelection): void {
    // Survivor 1 ability
    switch (selection.survivorDef.abilityName) {
      case 'sprint_burst':
        this.survivorAbility = new SprintBurst(this.survivor);
        break;
      case 'dead_hard':
        this.deadHard = new DeadHard(this.survivor);
        this.survivorAbility = this.deadHard;
        break;
    }

    // Survivor 2 ability
    switch (selection.survivor2Def.abilityName) {
      case 'sprint_burst':
        this.survivor2Ability = new SprintBurst(this.survivor2);
        break;
      case 'dead_hard':
        this.deadHard2 = new DeadHard(this.survivor2);
        this.survivor2Ability = this.deadHard2;
        break;
    }

    switch (selection.killerDef.abilityName) {
      case 'trap':
        this.trapAbility = new TrapAbility(this.killer);
        this.killerAbility = this.trapAbility;
        break;
      case 'throw_axe':
        this.throwAxe = new ThrowAxe(this.killer);
        this.killerAbility = this.throwAxe;
        break;
    }
  }

  private placeObjects(): void {
    const rng = this.seededRandom(123);
    const roomSize = 8;
    const rooms: { x: number; y: number }[] = [];

    for (let ry = 0; ry < Math.floor(this.map.rows / roomSize); ry++) {
      for (let rx = 0; rx < Math.floor(this.map.cols / roomSize); rx++) {
        rooms.push({ x: rx * roomSize, y: ry * roomSize });
      }
    }

    for (let i = rooms.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [rooms[i], rooms[j]] = [rooms[j], rooms[i]];
    }

    let roomIdx = 0;

    for (let i = 0; i < GENERATORS_ON_MAP && roomIdx < rooms.length; i++) {
      const room = rooms[roomIdx++];
      const gx = room.x + 3 + Math.floor(rng() * 3);
      const gy = room.y + 3 + Math.floor(rng() * 3);
      if (this.map.isWalkable(gx, gy)) {
        this.generators.push(new Generator(gx, gy));
      }
    }

    for (let i = 0; i < 4 && roomIdx < rooms.length; i++) {
      const room = rooms[roomIdx++];
      const hx = room.x + 2 + Math.floor(rng() * 4);
      const hy = room.y + 2 + Math.floor(rng() * 4);
      if (this.map.isWalkable(hx, hy)) {
        this.hooks.push(new Hook(hx, hy));
      }
    }

    // Exit gates
    const gate1Y = 1;
    const gate2Y = this.map.rows - 2;
    let g1x = Math.floor(this.map.cols / 2);
    let g2x = Math.floor(this.map.cols / 2);
    while (g1x < this.map.cols - 3 && !this.map.isWalkable(g1x, gate1Y)) g1x++;
    while (g2x < this.map.cols - 3 && !this.map.isWalkable(g2x, gate2Y)) g2x++;
    this.map.set(g1x, gate1Y, 0);
    this.map.set(g1x + 1, gate1Y, 0);
    this.map.set(g2x, gate2Y, 0);
    this.map.set(g2x + 1, gate2Y, 0);
    this.exitGates.push(new ExitGate(g1x, gate1Y));
    this.exitGates.push(new ExitGate(g2x, gate2Y));

    // Place pallets at doorways/corridors
    this.placePalletsAtDoorways(rng);

    for (; roomIdx < rooms.length; roomIdx++) {
      const room = rooms[roomIdx];
      if (rng() > 0.65) {
        const lx = room.x + 1 + Math.floor(rng() * 5);
        const ly = room.y + 1 + Math.floor(rng() * 5);
        if (this.map.isWalkable(lx, ly)) {
          this.lockers.push(new Locker(lx, ly));
        }
      }
    }
  }

  /** Find doorway tiles and place pallets at a subset of them */
  private placePalletsAtDoorways(rng: () => number): void {
    const doorways: { x: number; y: number; orientation: 'h' | 'v' }[] = [];
    const added = new Set<string>();

    for (let y = 2; y < this.map.rows - 2; y++) {
      for (let x = 2; x < this.map.cols - 2; x++) {
        if (!this.map.isWalkable(x, y)) continue;

        const openLR = this.map.isWalkable(x - 1, y) && this.map.isWalkable(x + 1, y);
        const wallAboveOrBelow = !this.map.isWalkable(x, y - 1) || !this.map.isWalkable(x, y + 1);
        if (openLR && wallAboveOrBelow) {
          const key = `h:${x}:${y}`;
          if (!added.has(key)) {
            doorways.push({ x, y, orientation: 'h' });
            added.add(key);
            added.add(`h:${x}:${y + 1}`);
            added.add(`h:${x}:${y - 1}`);
          }
          continue;
        }

        const openUD = this.map.isWalkable(x, y - 1) && this.map.isWalkable(x, y + 1);
        const wallLeftOrRight = !this.map.isWalkable(x - 1, y) || !this.map.isWalkable(x + 1, y);
        if (openUD && wallLeftOrRight) {
          const key = `v:${x}:${y}`;
          if (!added.has(key)) {
            doorways.push({ x, y, orientation: 'v' });
            added.add(key);
            added.add(`v:${x + 1}:${y}`);
            added.add(`v:${x - 1}:${y}`);
          }
        }
      }
    }

    for (let i = doorways.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [doorways[i], doorways[j]] = [doorways[j], doorways[i]];
    }

    const count = Math.min(15, Math.floor(doorways.length * 0.4));
    for (let i = 0; i < count; i++) {
      const d = doorways[i];
      this.pallets.push(new Pallet(d.x, d.y, d.orientation));
    }
  }

  /** Check if a rectangle collides with any dropped pallet */
  /** Move a character by raw velocity with wall collision (for dashes) */
  private dashMove(c: Character, vx: number, vy: number, dt: number): void {
    c.prevX = c.pos.x;
    c.prevY = c.pos.y;
    c.isMoving = true;
    const nextX = c.pos.x + vx * dt;
    if (!this.map.collidesRect(nextX, c.pos.y, c.width, c.height)) {
      c.pos.x = nextX;
    }
    const nextY = c.pos.y + vy * dt;
    if (!this.map.collidesRect(c.pos.x, nextY, c.width, c.height)) {
      c.pos.y = nextY;
    }
  }

  private palletCollision(px: number, py: number, w: number, h: number): boolean {
    for (const pallet of this.pallets) {
      if (!pallet.dropped || pallet.isDestroyed) continue;
      if (px < pallet.pos.x + pallet.width &&
          px + w > pallet.pos.x &&
          py < pallet.pos.y + pallet.height &&
          py + h > pallet.pos.y) {
        return true;
      }
    }
    return false;
  }

  private seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
  }

  private findWalkableSpawn(startX: number, startY: number): { x: number; y: number } {
    for (let r = 0; r < 25; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const tx = startX + dx;
          const ty = startY + dy;
          if (this.map.isWalkable(tx, ty) &&
              (this.map.isWalkable(tx + 1, ty) || this.map.isWalkable(tx - 1, ty)) &&
              (this.map.isWalkable(tx, ty + 1) || this.map.isWalkable(tx, ty - 1))) {
            return { x: tx, y: ty };
          }
        }
      }
    }
    return { x: startX, y: startY };
  }

  update(dt: number): void {
    if (this.phase !== GamePhase.Playing) return;

    // --- Survivor 1 input (guest1 / AI / WASD) ---
    let sdx = 0, sdy = 0;
    let survivorInteract = false;
    let survivorAbilityInput = false;

    if (this.guest1Input) {
      // Human guest controlling survivor1 (online mode)
      sdx = this.guest1Input.dx;
      sdy = this.guest1Input.dy;
      survivorInteract = this.guest1Input.interactHeld;
      survivorAbilityInput = this.guest1Input.ability;
      this.survivor.walking = this.guest1Input.walk;
    } else if (this.survivorAI) {
      const aiResult = this.survivorAI.update(dt);
      sdx = aiResult.dx;
      sdy = aiResult.dy;
      survivorInteract = aiResult.interact;
      survivorAbilityInput = aiResult.ability;
      this.survivor.walking = aiResult.walk;
    } else {
      if (this.input.isDown('KeyW')) sdy -= 1;
      if (this.input.isDown('KeyS')) sdy += 1;
      if (this.input.isDown('KeyA')) sdx -= 1;
      if (this.input.isDown('KeyD')) sdx += 1;
      this.survivor.walking = this.input.isDown('ShiftLeft');
    }

    // --- Survivor 2 input (AI or guest2) ---
    let s2dx = 0, s2dy = 0;
    let survivor2Interact = false;
    let survivor2AbilityInput = false;

    if (this.guest2Input) {
      // Human guest controlling survivor2
      s2dx = this.guest2Input.dx;
      s2dy = this.guest2Input.dy;
      survivor2Interact = this.guest2Input.interactHeld;
      survivor2AbilityInput = this.guest2Input.ability;
      this.survivor2.walking = this.guest2Input.walk;
    } else if (this.survivor2AI) {
      const aiResult = this.survivor2AI.update(dt);
      s2dx = aiResult.dx;
      s2dy = aiResult.dy;
      survivor2Interact = aiResult.interact;
      survivor2AbilityInput = aiResult.ability;
      this.survivor2.walking = aiResult.walk;
    }

    // --- Killer input (Arrow keys or WASD when playing as killer / AI) ---
    let kdx = 0, kdy = 0;
    let killerInteract = false;
    let killerAbilityInput = false;

    if (this.killerAI) {
      const aiResult = this.killerAI.update(dt);
      kdx = aiResult.dx;
      kdy = aiResult.dy;
      killerInteract = aiResult.interact;
      killerAbilityInput = aiResult.ability;
      this.killer.walking = aiResult.walk;
    } else if (this.playerRole === PlayerRole.Killer) {
      if (this.input.isDown('KeyW')) kdy -= 1;
      if (this.input.isDown('KeyS')) kdy += 1;
      if (this.input.isDown('KeyA')) kdx -= 1;
      if (this.input.isDown('KeyD')) kdx += 1;
      this.killer.walking = this.input.isDown('ShiftLeft');
    } else {
      if (this.input.isDown('ArrowUp')) kdy -= 1;
      if (this.input.isDown('ArrowDown')) kdy += 1;
      if (this.input.isDown('ArrowLeft')) kdx -= 1;
      if (this.input.isDown('ArrowRight')) kdx += 1;
      this.killer.walking = this.input.isDown('ShiftRight');
    }

    const playingAsKiller = this.playerRole === PlayerRole.Killer;

    this.isRepairing = false;

    // Reset beingRepaired each frame before interactions set it per-generator
    for (const gen of this.generators) {
      if (!gen.beingRepaired) {
        gen.idle(dt);
      }
      gen.beingRepaired = false;
    }

    // === Survivor 1 interactions ===
    // isAI: true when controlled by AI or remote guest (not local player survivor)
    const s1IsAI = playingAsKiller || !!this.guest1Input;
    this.updateSurvivorInteractions(
      this.survivor, sdx, sdy, survivorInteract, survivorAbilityInput,
      this.survivorAbility, this.deadHard, s1IsAI, false, dt,
      this.guest1Input,
    );

    // === Survivor 2 interactions ===
    const s2IsAI = true; // always AI or remote guest
    this.updateSurvivorInteractions(
      this.survivor2, s2dx, s2dy, survivor2Interact, survivor2AbilityInput,
      this.survivor2Ability, this.deadHard2, s2IsAI, true, dt,
      this.guest2Input,
    );

    // Killer generator kick
    const killerInteractHeld = playingAsKiller
      ? this.input.isDown('KeyE')
      : this.input.isDown('Period');
    if ((killerInteractHeld || killerInteract) && !this.killer.isCarrying && !this.killer.isStunned) {
      if (!this.kickingGen) {
        for (const gen of this.generators) {
          if (!gen.completed && gen.progress > 0 && !gen.beingRepaired && !gen.regressing &&
              CollisionSystem.distance(this.killer, gen) < TILE_SIZE * 1.5) {
            this.kickingGen = gen;
            this.kickTimer = 0;
            break;
          }
        }
      }
      if (this.kickingGen) {
        if (CollisionSystem.distance(this.killer, this.kickingGen) >= TILE_SIZE * 2 ||
            this.kickingGen.completed || this.kickingGen.beingRepaired) {
          this.kickingGen = null;
          this.kickTimer = 0;
        } else {
          this.kickTimer += dt;
          if (this.kickTimer >= Game.KICK_DURATION) {
            this.kickingGen.kick();
            audioManager.playGeneratorKick();
            this.kickingGen = null;
            this.kickTimer = 0;
          }
        }
      }
    } else {
      this.kickingGen = null;
      this.kickTimer = 0;
    }
    for (const gen of this.generators) {
      gen.kickProgress = (gen === this.kickingGen) ? this.kickTimer / Game.KICK_DURATION : 0;
    }

    // Killer interact (attack / hook / pallet break / pickup / locker search)
    const killerInteractPressed = playingAsKiller
      ? this.input.wasPressed('KeyE')
      : this.input.wasPressed('Period');
    if ((killerInteractPressed || killerInteract) && !this.kickingGen) {
      if (this.killer.isCarrying) {
        let hooked = false;
        for (const hook of this.hooks) {
          if (!hook.hooked && CollisionSystem.distance(this.killer, hook) < TILE_SIZE * 1.5) {
            hook.hookSurvivor(this.killer.carrying!);
            this.killer.carrying = null;
            this.killer.speed = KILLER_BASE_SPEED;
            hooked = true;
            audioManager.playHook();
            audioManager.playHookScream();
            break;
          }
        }
        if (!hooked) this.killer.dropSurvivor(this.map);
      } else if (this.killer.canAttack) {
        let hit = false;
        // Try attack each survivor
        for (const s of this.survivors) {
          // Check dead hard invincibility
          const dh = s === this.survivor ? this.deadHard : this.deadHard2;
          if (dh && dh.invincible) continue;

          if (this.killer.tryAttack(s)) {
            hit = true;
            audioManager.playAttack();
            audioManager.playHit();
            break;
          }
        }
        if (!hit) {
          // Try break pallets
          for (const pallet of this.pallets) {
            if (pallet.dropped && !pallet.isDestroyed && CollisionSystem.distance(this.killer, pallet) < TILE_SIZE * 1.5) {
              pallet.breakPallet();
              audioManager.playPalletBreak();
              break;
            }
          }
          // Try pickup any dying survivor
          for (const s of this.survivors) {
            const dh = s === this.survivor ? this.deadHard : this.deadHard2;
            if (dh && dh.invincible) continue;
            if (this.killer.tryPickup(s)) break;
          }
          // Search lockers
          for (const locker of this.lockers) {
            if (locker.isOccupied && CollisionSystem.distance(this.killer, locker) < TILE_SIZE * 1.5) {
              const found = locker.exit();
              if (found) {
                found.takeDamage();
                audioManager.playLocker();
                audioManager.playHit();
              }
              break;
            }
          }
        }
      }
    }

    // Killer ability
    const killerAbilityPressed = playingAsKiller
      ? this.input.wasPressed('KeyQ')
      : this.input.wasPressed('Comma');
    if ((killerAbilityPressed || killerAbilityInput) && this.killerAbility) {
      if (this.killerAbility.activate()) {
        if (this.throwAxe && this.killerAbility === this.throwAxe) {
          audioManager.playAxeThrow();
        } else {
          audioManager.playAbilityActivate();
        }
      }
    }

    // === Movement ===
    // Survivor 1
    const s1Locker = this.lockers.find((l) => l.occupant === this.survivor);
    const s1Hooked = this.hooks.some((h) => h.hooked === this.survivor);
    if (!this.survivor.isIncapacitated && !s1Locker && !s1Hooked) {
      if (this.deadHard?.isActive) {
        const { dx, dy } = this.deadHard.getDashVelocity();
        this.dashMove(this.survivor, dx, dy, dt);
      } else {
        this.survivor.move(sdx, sdy, dt, this.map);
      }
    }

    // Survivor 2
    const s2Locker = this.lockers.find((l) => l.occupant === this.survivor2);
    const s2Hooked = this.hooks.some((h) => h.hooked === this.survivor2);
    if (!this.survivor2.isIncapacitated && !s2Locker && !s2Hooked) {
      if (this.deadHard2?.isActive) {
        const { dx, dy } = this.deadHard2.getDashVelocity();
        this.dashMove(this.survivor2, dx, dy, dt);
      } else {
        this.survivor2.move(s2dx, s2dy, dt, this.map);
      }
    }

    // Killer movement
    if (!this.killer.isStunned && !this.kickingGen) {
      const palletBlocker = (px: number, py: number, w: number, h: number) =>
        this.palletCollision(px, py, w, h);
      this.killer.move(kdx, kdy, dt, this.map, palletBlocker);
    }

    // Carried survivor
    if (this.killer.carrying) {
      this.killer.carrying.pos.x = this.killer.pos.x;
      this.killer.carrying.pos.y = this.killer.pos.y - 4;
      this.killer.carrying.prevX = this.killer.carrying.pos.x;
      this.killer.carrying.prevY = this.killer.carrying.pos.y;
    }

    // Update abilities
    this.survivorAbility?.update(dt);
    this.survivor2Ability?.update(dt);
    this.killerAbility?.update(dt);

    // Update traps — check both survivors
    if (this.trapAbility) {
      for (const trap of this.trapAbility.traps) {
        trap.update(dt);
        if (trap.armed && !trap.trapped) {
          for (const s of this.survivors) {
            if (trap.checkTrigger(s)) {
              audioManager.playTrapSnap();
              break;
            }
          }
        }
      }
    }

    // Update thrown axes — check both survivors
    if (this.throwAxe) {
      for (const axe of this.throwAxe.axes) {
        axe.update(dt, this.map);
        if (axe.alive) {
          for (const s of this.survivors) {
            if (CollisionSystem.overlaps(axe, s)) {
              const dh = s === this.survivor ? this.deadHard : this.deadHard2;
              if (!(dh && dh.invincible)) {
                s.takeDamage();
                axe.alive = false;
                audioManager.playHit();
                break;
              }
            }
          }
        }
      }
      this.throwAxe.cleanup();
    }

    // Timers
    this.killer.updateTimers(dt);
    this.skillCheck1.update(dt);
    this.skillCheck2.update(dt);

    for (const gen of this.generators) {
      if (gen.completionRevealTimer > 0) gen.completionRevealTimer -= dt;
    }

    for (const hook of this.hooks) hook.update(dt);

    // Scratch marks — track both survivors
    const runners: ScratchMarkRunner[] = this.survivors.map((s, i) => {
      const dx = i === 0 ? sdx : s2dx;
      const dy = i === 0 ? sdy : s2dy;
      return {
        x: s.centerX,
        y: s.centerY,
        isRunning: !s.walking && (dx !== 0 || dy !== 0) && !s.isIncapacitated,
      };
    });
    this.scratchMarks.update(dt, runners);

    // Fog & Camera — survivor fog is union of both survivors
    this.survivorFog.updateMultiple(
      this.survivors
        .filter((s) => s.health !== HealthState.Dead)
        .map((s) => ({ x: s.centerX, y: s.centerY })),
    );
    this.killerFog.update(this.killer.centerX, this.killer.centerY);

    // Camera follows the player's character
    if (this.playerRole === PlayerRole.Survivor) {
      this.survivorCamera.follow({ x: this.survivor.centerX, y: this.survivor.centerY });
    }
    this.killerCamera.follow({ x: this.killer.centerX, y: this.killer.centerY });

    // Repair tick sound
    if (this.isRepairing) {
      this.repairTickTimer += dt;
      if (this.repairTickTimer > 0.25) {
        this.repairTickTimer = 0;
        audioManager.playRepairTick();
      }
    } else {
      this.repairTickTimer = 0;
    }

    // Heartbeat (terror radius) — based on player's survivor distance
    const playerSurvivor = this.localSurvivor;
    const terrorIntensity = TerrorRadius.getIntensity(
      this.killer.centerX, this.killer.centerY,
      playerSurvivor.centerX, playerSurvivor.centerY,
    );
    audioManager.updateHeartbeat(terrorIntensity);

    // Chase detection — killer can see ANY alive survivor nearby
    const chaseRange = TILE_SIZE * 8;
    let chaseActive = false;
    for (const s of this.survivors) {
      if (s.isIncapacitated || s.health === HealthState.Dead) continue;
      const dx2 = this.killer.centerX - s.centerX;
      const dy2 = this.killer.centerY - s.centerY;
      const distKS = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      const sTX = Math.floor(s.centerX / TILE_SIZE);
      const sTY = Math.floor(s.centerY / TILE_SIZE);
      const killerCanSee = this.killerFog.isVisible(sTX, sTY);
      if (distKS < chaseRange && killerCanSee) {
        chaseActive = true;
        break;
      }
    }

    if (chaseActive) {
      this.chaseCooldown = 3;
      if (!this.inChase) {
        this.inChase = true;
        audioManager.startChase();
      }
    } else if (this.inChase) {
      this.chaseCooldown -= dt;
      if (this.chaseCooldown <= 0) {
        this.inChase = false;
        audioManager.stopChase();
      }
    }

    // Gate powered sound (one-shot)
    if (this.gatesPowered && !this.prevGatesPowered) {
      audioManager.playGatePowered();
    }
    this.prevGatesPowered = this.gatesPowered;

    // Win conditions
    // Killer wins if ALL survivors are dead
    const allDead = this.survivors.every((s) => s.health === HealthState.Dead);
    if (allDead) {
      this.phase = GamePhase.KillerWin;
    }
    // Survivor wins if ANY survivor escapes
    for (const gate of this.exitGates) {
      if (!gate.isOpen) continue;
      for (const s of this.survivors) {
        if (!s.isIncapacitated && CollisionSystem.distance(s, gate) < TILE_SIZE * 2) {
          this.phase = GamePhase.SurvivorWin;
        }
      }
    }

    // Win/lose sound (one-shot)
    if (this.phase !== this.prevPhase) {
      audioManager.stopHeartbeat();
      audioManager.stopChase();
      this.inChase = false;
      if (this.phase === GamePhase.SurvivorWin) {
        audioManager.playEscape();
      } else if (this.phase === GamePhase.KillerWin) {
        audioManager.playSacrifice();
      }
    }
    this.prevPhase = this.phase;
    // Note: input.endFrame() is called by main.ts game loop, not here,
    // so that main.ts can read wasPressed('KeyR') / wasPressed('Escape') after update.
  }

  /** Handle survivor-specific interactions (repair, pallet, locker, skill check, etc.) */
  private updateSurvivorInteractions(
    s: Survivor,
    sdx: number,
    sdy: number,
    aiInteract: boolean,
    aiAbility: boolean,
    ability: Ability | null,
    deadHard: DeadHard | null,
    isAI: boolean,
    isSecondSurvivor: boolean,
    dt: number,
    guestInput: NetInput | null = null,
  ): void {
    const playingAsKiller = this.playerRole === PlayerRole.Killer;
    const survivorLocker = this.lockers.find((l) => l.occupant === s);
    const isHooked = this.hooks.some((h) => h.hooked === s);
    /** This survivor is controlled by a local human player (not AI, not remote guest) */
    const isLocalPlayer = !isAI && !playingAsKiller && !isSecondSurvivor && !guestInput;
    const sc = isSecondSurvivor ? this.skillCheck2 : this.skillCheck1;

    // Survivor ability
    const abilityInput = guestInput ? guestInput.ability
      : isAI ? aiAbility
      : (isLocalPlayer && this.input.wasPressed('KeyQ'));
    if (abilityInput) {
      if (ability?.activate()) {
        audioManager.playAbilityActivate();
      }
    }

    // Skill check / self-unhook
    const spaceInput = guestInput ? guestInput.space
      : (isLocalPlayer && this.input.wasPressed('Space'));
    if (spaceInput) {
      if (sc.active) {
        const scResult = sc.hit();
        switch (scResult) {
          case 'great': audioManager.playSkillCheckGreat(); break;
          case 'good': audioManager.playSkillCheckGood(); break;
          case 'miss': audioManager.playSkillCheckMiss(); break;
        }
      } else if (isHooked) {
        const hook = this.hooks.find((h) => h.hooked === s);
        if (hook && hook.canSelfUnhook) {
          if (hook.attemptSelfUnhook()) {
            audioManager.playLocker();
          }
        }
      }
    }

    // Survivor interact
    const interactHeld = guestInput ? guestInput.interactHeld
      : isAI ? aiInteract
      : (playingAsKiller ? aiInteract : this.input.isDown('KeyE'));
    const interactPressed = guestInput ? guestInput.interact
      : isAI ? aiInteract
      : (playingAsKiller ? aiInteract : this.input.wasPressed('KeyE'));

    if (interactHeld && !s.isIncapacitated && !isHooked) {
      if (survivorLocker) {
        if (interactPressed) {
          survivorLocker.exit();
          audioManager.playLocker();
        }
      } else {
        // Rescue teammate from hook (hold interact near a hooked teammate)
        let didRescue = false;
        for (const hook of this.hooks) {
          if (hook.hooked && hook.hooked !== s && CollisionSystem.distance(s, hook) < TILE_SIZE * 2) {
            if (hook.rescue(dt)) {
              audioManager.playLocker(); // rescue sound
            }
            didRescue = true;
            break;
          }
        }

        if (!didRescue) {
          let repairedGen = false;
          for (const gen of this.generators) {
            if (!gen.completed && CollisionSystem.distance(s, gen) < TILE_SIZE * 2) {
              gen.repair(dt, sc.repairBonus);
              if (s === this.survivor) this.isRepairing = true;
              repairedGen = true;
              // Skill check: trigger for human-controlled survivors (local player or guest)
              if (!isAI || guestInput !== null) {
                const timer = isSecondSurvivor ? this.skillCheckTimer2 : this.skillCheckTimer1;
                const newTimer = timer + dt;
                if (newTimer > 3 + Math.random() * 4) {
                  if (isSecondSurvivor) this.skillCheckTimer2 = 0;
                  else this.skillCheckTimer1 = 0;
                  sc.trigger();
                } else {
                  if (isSecondSurvivor) this.skillCheckTimer2 = newTimer;
                  else this.skillCheckTimer1 = newTimer;
                }
              }
              break;
            }
          }

          if (!repairedGen) {
            if (isSecondSurvivor) this.skillCheckTimer2 = 0;
            else this.skillCheckTimer1 = 0;
            for (const gate of this.exitGates) {
              if (gate.powered && !gate.isOpen && CollisionSystem.distance(s, gate) < TILE_SIZE * 2.5) {
                gate.tryOpen(dt);
                break;
              }
            }
          }

          if (interactPressed && !repairedGen) {
            for (const locker of this.lockers) {
              if (!locker.isOccupied && CollisionSystem.distance(s, locker) < TILE_SIZE * 1.5) {
                locker.enter(s);
                audioManager.playLocker();
                break;
              }
            }
          }

          if (interactPressed) {
            for (const pallet of this.pallets) {
              if (!pallet.dropped && !pallet.isDestroyed && CollisionSystem.distance(s, pallet) < TILE_SIZE * 1.5) {
                const killerNear = CollisionSystem.distance(this.killer, pallet) < TILE_SIZE * 1.5;
                pallet.drop();
                audioManager.playPalletDrop();
                if (killerNear) {
                  this.killer.applyStun(this.map);
                  audioManager.playStun();
                }
                break;
              }
            }
          }
        }
      }
    }
  }

  /** Disable survivor2 AI (when a human guest controls survivor2) */
  disableSurvivor2AI(): void {
    this.survivor2AI = null;
  }

  render(alpha: number): void {
    this.renderer.clear();

    const characters: Character[] = [...this.survivors, this.killer];
    const objects: WorldObjects = {
      pallets: this.pallets,
      lockers: this.lockers,
      generators: this.generators,
      hooks: this.hooks,
      exitGates: this.exitGates,
    };

    const isKillerPlayer = this.playerRole === PlayerRole.Killer;
    const view: RenderView = {
      camera: isKillerPlayer ? this.killerCamera : this.survivorCamera,
      fog: isKillerPlayer ? this.killerFog : this.survivorFog,
      character: isKillerPlayer ? this.killer : this.localSurvivor,
      offsetX: 0, offsetY: 0,
      width: this.viewportWidth, height: this.viewportHeight,
    };
    this.renderer.renderView(view, this.map, characters, objects, this.scratchMarks, this.killer, this.survivors, alpha);
    this.renderAbilityProjectiles(view);
    if (!isKillerPlayer) {
      const localSC = this.localSurvivor === this.survivor2 ? this.skillCheck2 : this.skillCheck1;
      this.renderer.renderSkillCheck(view, localSC, this.killer);
    }

    // HUD overlay (Canvas-based, top-left)
    const hookedHook = this.hooks.find((h) => h.hooked === this.survivor) ?? null;
    const hookedHook2 = this.hooks.find((h) => h.hooked === this.survivor2) ?? null;
    this.infoPanel.render(
      this.renderer.ctx,
      this.survivors, this.killer,
      this.generatorsCompleted, this.gatesPowered, this.isRepairing,
      [this.survivorAbility, this.survivor2Ability], this.killerAbility,
      [hookedHook, hookedHook2],
      this.playerRole,
    );

    if (this.phase !== GamePhase.Playing) {
      this.renderGameOver();
    }
  }

  private renderAbilityProjectiles(view: RenderView): void {
    const ctx = this.renderer.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(view.offsetX, view.offsetY, view.width, view.height);
    ctx.clip();
    ctx.translate(view.offsetX, view.offsetY);

    // Traps
    const isKillerView = view.character === this.killer;
    if (this.trapAbility) {
      for (const trap of this.trapAbility.traps) {
        const tileX = trap.tileX;
        const tileY = trap.tileY;
        if (!view.fog.isVisible(tileX, tileY)) {
          if (!isKillerView) continue;
        }
        trap.render(ctx, trap.pos.x - view.camera.x, trap.pos.y - view.camera.y, isKillerView);
      }
    }

    // Axes
    if (this.throwAxe) {
      for (const axe of this.throwAxe.axes) {
        if (!axe.alive) continue;
        const tileX = Math.floor(axe.centerX / TILE_SIZE);
        const tileY = Math.floor(axe.centerY / TILE_SIZE);
        if (!view.fog.isVisible(tileX, tileY)) continue;
        axe.render(ctx, axe.pos.x - view.camera.x, axe.pos.y - view.camera.y);
      }
    }

    ctx.restore();
  }

  private renderGameOver(): void {
    const ctx = this.renderer.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, GAME_HEIGHT);

    ctx.fillStyle = this.phase === GamePhase.SurvivorWin ? '#00ff88' : '#ff2244';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    const msg = this.phase === GamePhase.SurvivorWin ? 'サバイバー脱出成功！' : 'キラーの勝利！';
    ctx.fillText(msg, CANVAS_WIDTH / 2, GAME_HEIGHT / 2);
    ctx.font = '16px monospace';
    ctx.fillStyle = '#aaa';
    ctx.fillText('R: リスタート　ESC: メニューに戻る', CANVAS_WIDTH / 2, GAME_HEIGHT / 2 + 40);
    ctx.textAlign = 'left';
  }
}
