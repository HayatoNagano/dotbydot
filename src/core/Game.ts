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
import { ScratchMarks } from '../systems/ScratchMarks';
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
} from '../constants';

export class Game {
  readonly map: TileMap;
  readonly survivor: Survivor;
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
  readonly skillCheck: SkillCheck;
  readonly infoPanel: InfoPanel;
  readonly selection: MenuSelection;

  survivorAbility: Ability | null = null;
  killerAbility: Ability | null = null;
  private trapAbility: TrapAbility | null = null;
  private throwAxe: ThrowAxe | null = null;
  private deadHard: DeadHard | null = null;

  phase: GamePhase = GamePhase.Playing;
  generatorsCompleted = 0;
  gatesPowered = false;
  isRepairing = false;

  private skillCheckTimer = 0;
  private repairTickTimer = 0;
  private prevSurvivorHealth: HealthState = HealthState.Healthy;
  private prevPhase: GamePhase = GamePhase.Playing;
  private prevGatesPowered = false;
  inChase = false;
  private chaseCooldown = 0; // grace period before stopping chase music
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly playerRole: PlayerRole;
  private killerAI: KillerAI | null = null;
  private survivorAI: SurvivorAI | null = null;
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
    this.skillCheck = new SkillCheck();
    this.infoPanel = new InfoPanel();

    // Spawn positions
    const sSpawn = this.findWalkableSpawn(5, 5);
    const kSpawn = this.findWalkableSpawn(this.map.cols - 6, this.map.rows - 6);

    this.survivor = new Survivor(sSpawn.x * TILE_SIZE + 2, sSpawn.y * TILE_SIZE + 2);
    this.survivor.color = selection.survivorDef.color;
    this.survivor.characterId = selection.survivorDef.id;
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

    // Setup AI for CPU mode
    if (selection.mode === GameMode.VsCPU) {
      if (this.playerRole === PlayerRole.Survivor) {
        this.killerAI = new KillerAI(
          this.killer, this.survivor, this.map, this.killerFog,
          this.scratchMarks, this.hooks, this.generators,
        );
      } else {
        this.survivorAI = new SurvivorAI(
          this.survivor, this.killer, this.map, this.survivorFog,
          this.generators, this.exitGates, this.lockers,
          () => this.gatesPowered,
        );
      }
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
    switch (selection.survivorDef.abilityName) {
      case 'sprint_burst':
        this.survivorAbility = new SprintBurst(this.survivor);
        break;
      case 'dead_hard':
        this.deadHard = new DeadHard(this.survivor);
        this.survivorAbility = this.deadHard;
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

        // Door in a VERTICAL wall (wall runs top-to-bottom, passage goes left-right):
        // Rooms on left and right are floor, wall is above or below (part of the wall column)
        const openLR = this.map.isWalkable(x - 1, y) && this.map.isWalkable(x + 1, y);
        const wallAboveOrBelow = !this.map.isWalkable(x, y - 1) || !this.map.isWalkable(x, y + 1);
        if (openLR && wallAboveOrBelow) {
          // Confirm it's a real doorway: at least one side above/below is wall
          const key = `h:${x}:${y}`;
          if (!added.has(key)) {
            doorways.push({ x, y, orientation: 'h' });
            added.add(key);
            // Skip the adjacent door tile
            added.add(`h:${x}:${y + 1}`);
            added.add(`h:${x}:${y - 1}`);
          }
          continue;
        }

        // Door in a HORIZONTAL wall (wall runs left-to-right, passage goes up-down):
        // Rooms above and below are floor, wall is left or right
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

    // Shuffle doorways and pick a subset
    for (let i = doorways.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [doorways[i], doorways[j]] = [doorways[j], doorways[i]];
    }

    // Place pallets at ~40% of doorways, max 15
    const count = Math.min(15, Math.floor(doorways.length * 0.4));
    for (let i = 0; i < count; i++) {
      const d = doorways[i];
      this.pallets.push(new Pallet(d.x, d.y, d.orientation));
    }
  }

  /** Check if a rectangle collides with any dropped pallet */
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
          // Ensure the tile and at least one neighbor are walkable (enough room)
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

    // --- Survivor input (WASD / AI) ---
    let sdx = 0, sdy = 0;
    let survivorInteract = false;
    let survivorAbilityInput = false;

    if (this.survivorAI) {
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
      // Player controls killer with WASD in CPU mode
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
    const survivorLocker = this.lockers.find((l) => l.occupant === this.survivor);
    const isHooked = this.hooks.some((h) => h.hooked === this.survivor);

    // Survivor ability
    if (survivorAbilityInput || (!playingAsKiller && this.input.wasPressed('KeyQ'))) {
      if (this.survivorAbility?.activate()) {
        audioManager.playAbilityActivate();
      }
    }

    // Killer ability (Q when playing as killer, Comma in 2P)
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

    // Skill check input (Space) / Self-unhook (Space while hooked) — only when playing as survivor
    if (!playingAsKiller && this.input.wasPressed('Space')) {
      if (this.skillCheck.active) {
        const scResult = this.skillCheck.hit();
        switch (scResult) {
          case 'great': audioManager.playSkillCheckGreat(); break;
          case 'good': audioManager.playSkillCheckGood(); break;
          case 'miss': audioManager.playSkillCheckMiss(); break;
        }
      } else if (isHooked) {
        const hook = this.hooks.find((h) => h.hooked === this.survivor);
        if (hook && hook.canSelfUnhook) {
          if (hook.attemptSelfUnhook()) {
            audioManager.playLocker();
          }
        }
      }
    }

    // Survivor interact (E when playing as survivor, or AI-driven)
    this.isRepairing = false;
    const survivorInteractHeld = playingAsKiller ? survivorInteract : this.input.isDown('KeyE');
    const survivorInteractPressed = playingAsKiller ? survivorInteract : this.input.wasPressed('KeyE');
    if (survivorInteractHeld && !this.survivor.isIncapacitated && !isHooked) {
      if (survivorLocker) {
        if (survivorInteractPressed) {
          survivorLocker.exit();
          audioManager.playLocker();
        }
      } else {
        let repairedGen = false;
        for (const gen of this.generators) {
          if (!gen.completed && CollisionSystem.distance(this.survivor, gen) < TILE_SIZE * 2) {
            gen.repair(dt, this.skillCheck.repairBonus);
            this.isRepairing = true;
            repairedGen = true;
            this.skillCheckTimer += dt;
            if (this.skillCheckTimer > 3 + Math.random() * 4) {
              this.skillCheckTimer = 0;
              this.skillCheck.trigger();
            }
            break;
          }
        }

        if (!repairedGen) {
          this.skillCheckTimer = 0;
          for (const gate of this.exitGates) {
            if (gate.powered && !gate.isOpen && CollisionSystem.distance(this.survivor, gate) < TILE_SIZE * 2.5) {
              gate.tryOpen(dt);
              break;
            }
          }
        }

        if (survivorInteractPressed && !repairedGen) {
          for (const locker of this.lockers) {
            if (!locker.isOccupied && CollisionSystem.distance(this.survivor, locker) < TILE_SIZE * 1.5) {
              locker.enter(this.survivor);
              audioManager.playLocker();
              break;
            }
          }
        }

        if (survivorInteractPressed) {
          for (const pallet of this.pallets) {
            if (!pallet.dropped && !pallet.isDestroyed && CollisionSystem.distance(this.survivor, pallet) < TILE_SIZE * 1.5) {
              // Check stun BEFORE drop (position shifts on drop)
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

    if (!this.isRepairing) {
      for (const gen of this.generators) gen.idle(dt);
    }

    // Killer generator kick (hold interact near unkicked generator)
    const killerInteractHeld = playingAsKiller
      ? this.input.isDown('KeyE')
      : this.input.isDown('Period');
    if ((killerInteractHeld || killerInteract) && !this.killer.isCarrying && !this.killer.isStunned) {
      if (!this.kickingGen) {
        // Find nearby generator to kick
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
        // Verify still in range and generator still valid
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
    // Update kick progress on generators for HUD display
    for (const gen of this.generators) {
      gen.kickProgress = (gen === this.kickingGen) ? this.kickTimer / Game.KICK_DURATION : 0;
    }

    // Killer interact (E when playing as killer, Period in 2P, or AI)
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
        // Check dead hard invincibility
        let immune = false;
        if (this.deadHard && this.deadHard.invincible) {
          immune = true;
        }

        const hit = immune ? false : this.killer.tryAttack(this.survivor);
        if (hit) {
          audioManager.playAttack();
          audioManager.playHit();
        }
        if (!hit) {
          for (const pallet of this.pallets) {
            if (pallet.dropped && !pallet.isDestroyed && CollisionSystem.distance(this.killer, pallet) < TILE_SIZE * 1.5) {
              pallet.breakPallet();
              audioManager.playPalletBreak();
              break;
            }
          }
          if (!immune) this.killer.tryPickup(this.survivor);

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

    // Movement
    if (!this.survivor.isIncapacitated && !survivorLocker && !isHooked) {
      // Dead Hard dash override
      if (this.deadHard?.isActive) {
        const { dx, dy } = this.deadHard.getDashVelocity();
        this.survivor.pos.x += dx * dt;
        this.survivor.pos.y += dy * dt;
      } else {
        this.survivor.move(sdx, sdy, dt, this.map);
      }
    }

    if (!this.killer.isStunned && !this.kickingGen) {
      const palletBlocker = (px: number, py: number, w: number, h: number) =>
        this.palletCollision(px, py, w, h);
      this.killer.move(kdx, kdy, dt, this.map, palletBlocker);
    }

    // Carried survivor
    if (this.killer.carrying) {
      this.killer.carrying.pos.x = this.killer.pos.x;
      this.killer.carrying.pos.y = this.killer.pos.y - 4;
      // Keep prevPos in sync so lerp works correctly after drop
      this.killer.carrying.prevX = this.killer.carrying.pos.x;
      this.killer.carrying.prevY = this.killer.carrying.pos.y;
    }

    // Update abilities
    this.survivorAbility?.update(dt);
    this.killerAbility?.update(dt);

    // Update traps
    if (this.trapAbility) {
      for (const trap of this.trapAbility.traps) {
        trap.update(dt);
        if (trap.armed && !trap.trapped) {
          if (trap.checkTrigger(this.survivor)) {
            audioManager.playTrapSnap();
          }
        }
      }
    }

    // Update thrown axes
    if (this.throwAxe) {
      for (const axe of this.throwAxe.axes) {
        axe.update(dt, this.map);
        // Hit check
        if (axe.alive && CollisionSystem.overlaps(axe, this.survivor)) {
          if (!(this.deadHard && this.deadHard.invincible)) {
            this.survivor.takeDamage();
            axe.alive = false;
            audioManager.playHit();
          }
        }
      }
      this.throwAxe.cleanup();
    }

    // Timers
    this.killer.updateTimers(dt);
    this.skillCheck.update(dt);

    // Generator completion reveal timer
    for (const gen of this.generators) {
      if (gen.completionRevealTimer > 0) gen.completionRevealTimer -= dt;
    }

    for (const hook of this.hooks) hook.update(dt);

    // Scratch marks
    this.scratchMarks.update(
      dt,
      this.survivor.centerX,
      this.survivor.centerY,
      !this.survivor.walking && (sdx !== 0 || sdy !== 0) && !this.survivor.isIncapacitated,
    );

    // Fog & Camera
    this.survivorFog.update(this.survivor.centerX, this.survivor.centerY);
    this.killerFog.update(this.killer.centerX, this.killer.centerY);
    this.survivorCamera.follow({ x: this.survivor.centerX, y: this.survivor.centerY });
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

    // Heartbeat (terror radius)
    const terrorIntensity = TerrorRadius.getIntensity(
      this.killer.centerX, this.killer.centerY,
      this.survivor.centerX, this.survivor.centerY,
    );
    audioManager.updateHeartbeat(terrorIntensity);

    // Chase detection — killer within chase range AND can see survivor
    const chaseRange = TILE_SIZE * 8;
    const dx2 = this.killer.centerX - this.survivor.centerX;
    const dy2 = this.killer.centerY - this.survivor.centerY;
    const distKS = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    const survTX = Math.floor(this.survivor.centerX / TILE_SIZE);
    const survTY = Math.floor(this.survivor.centerY / TILE_SIZE);
    const killerCanSee = this.killerFog.isVisible(survTX, survTY);
    const chaseActive = distKS < chaseRange && killerCanSee && !this.survivor.isIncapacitated;

    if (chaseActive) {
      this.chaseCooldown = 3; // 3-second grace period after losing sight
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
    if (this.survivor.health === HealthState.Dead) {
      this.phase = GamePhase.KillerWin;
    }
    for (const gate of this.exitGates) {
      if (gate.isOpen && CollisionSystem.distance(this.survivor, gate) < TILE_SIZE * 2) {
        if (!this.survivor.isIncapacitated) {
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

    this.input.endFrame();
  }

  render(alpha: number): void {
    this.renderer.clear();

    const characters: Character[] = [this.survivor, this.killer];
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
      character: isKillerPlayer ? this.killer : this.survivor,
      offsetX: 0, offsetY: 0,
      width: this.viewportWidth, height: this.viewportHeight,
    };
    this.renderer.renderView(view, this.map, characters, objects, this.scratchMarks, this.killer, this.survivor, alpha);
    this.renderAbilityProjectiles(view);
    if (!isKillerPlayer) {
      this.renderer.renderSkillCheck(view, this.skillCheck, this.killer);
    }

    // Info panel (DOM-based, fixed at browser bottom)
    const hookedHook = this.hooks.find((h) => h.hooked === this.survivor) ?? null;
    this.infoPanel.update(
      this.survivor, this.killer,
      this.generatorsCompleted, this.gatesPowered, this.isRepairing,
      this.survivorAbility, this.killerAbility,
      hookedHook,
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
          // Killer can always see own traps
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
