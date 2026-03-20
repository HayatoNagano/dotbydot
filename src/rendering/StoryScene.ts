/**
 * Story mode: cinematic scrolling text with pixel art scenes.
 * Movie end-credits style presentation of the game's lore.
 */

import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants';

// ─── Story text segments ───
// Each segment has text lines and an optional scene to render alongside
interface StorySegment {
  lines: string[];
  scene?: (ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number) => void;
  gap?: number; // extra gap after segment (default 80)
}

const STORY_SEGMENTS: StorySegment[] = [
  {
    lines: [
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      'Ｄ Ｏ Ｔ 　 Ｂ Ｙ 　 Ｄ Ｏ Ｔ',
      '',
      '～ ドットの森の物語 ～',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ],
    gap: 160,
  },
  {
    lines: [
      '【 第一章：エンテーテ 】',
    ],
    gap: 60,
    scene: renderEntityScene,
  },
  {
    lines: [
      'それは、古代から存在する邪悪な力。',
      '',
      '理由もなく世界を無造作に弄ぶ',
      '固有の姿を持たず、邪悪さを抱えた存在――',
      '人はそれを「エンテーテ」と呼んだ。',
      '',
      'エンテーテが求めるものは、',
      '人間の悲鳴、苦痛に満ちた表情。',
      '',
      '追われる者の恐怖。',
      '逃げ切れるかもしれないという希望。',
      'そして、その希望が砕ける瞬間の絶望。',
      '',
      'その繰り返しこそが、',
      'エンテーテの糧となる。',
      '',
      'エンテーテが創造するのは、世界そのもの。',
      '気ままに、残酷に、無造作に世界を創造する。',
      'しかし今回は、寝起きで寝ぼけていたせいか、',
      'てきとーな荒いピクセルのドットの世界が創造された。',
    ],
    gap: 120,
  },
  {
    lines: [
      '【 第二章：霧の領域 】',
    ],
    gap: 60,
    scene: renderFogScene,
  },
  {
    lines: [
      'エンテーテは「霧」を使い、',
      '現実世界から獲物を引きずり込む。',
      '',
      '深い霧の中で目覚めた者は、',
      '見知らぬ廃墟に囚われている。',
      '',
      '視界は数歩先までしか届かず、',
      '壁の向こうに何が潜んでいるのか、',
      '誰にもわからない。',
      '',
      'これが「試練」と呼ばれる狩り場。',
      '',
      '逃げ道はただ一つ――',
      '放棄された発電機を修理し、',
      '脱出ゲートに電力を送ること。',
      '',
      'だが発電機の音はキラーを引き寄せ、',
      '一瞬の油断が命取りになる。',
    ],
    gap: 120,
  },
  {
    lines: [
      '【 第三章：殺戮者たち 】',
    ],
    gap: 60,
    scene: renderKillerScene,
  },
  {
    lines: [
      'エンテーテは、闇を抱えた魂を見つけ出し、',
      '殺戮者――キラーとして使役する。',
      '',
      '彼らもまた囚われた者。',
      'かつて人間だった者たちの成れの果て。',
      '',
      '',
      'トラッパー――',
      '代々続く罠猟師の家系に生まれた男。',
      '父の狂気を受け継ぎ、',
      '人も獣も区別なく罠にかけるようになった。',
      '鉄の顎が閉じる音だけが、',
      '彼に残された唯一の喜び。',
      '',
      '',
      'ハントレス――',
      '極寒の森で母を失い、',
      '獣と共に育った孤独な狩人。',
      '彼女にとって人間もまた「獲物」に過ぎない。',
      '森に響く子守歌が聞こえた時、',
      '手斧はすでに放たれている。',
    ],
    gap: 120,
  },
  {
    lines: [
      '【 第四章：生存者たち 】',
    ],
    gap: 60,
    scene: renderSurvivorScene,
  },
  {
    lines: [
      'エンテーテは時に何の罪もない無垢な人間をも呼び寄せる',
      '',
      '',
      'ドワット――',
      '目立たず、友も少ない冴えない青年。',
      '誰にも気づかれずに生きてきた彼は、',
      'ある夜、帰り道で霧に飲まれた。',
      '',
      'しかし、誰にも気づかれない能力は、',
      'この世界では生存の武器になった。',
      '仲間の危機には誰よりも先に駆けつけ、',
      '怯えながらも決して見捨てない。',
      '',
      '',
      'フェンリー――',
      '街で一人暮らしをしていた気丈な女性。',
      '夜のジョギング中に霧が立ち込め、',
      '気づいた時にはこの世界にいた。',
      '',
      '追い詰められた時こそ本領を発揮する。',
      '死の間際に一瞬だけ限界を超える力――',
      'どんな絶望的な状況でも、',
      '最後の最後まで諦めない。',
    ],
    gap: 120,
  },
  {
    lines: [
      '【 第五章：焚き火 】',
    ],
    gap: 60,
    scene: renderCampfireStoryScene,
  },
  {
    lines: [
      '試練と試練の狭間に、',
      '一つだけ安息の場所がある。',
      '',
      '闇の中にぽつりと灯る焚き火。',
      'それはドット絵だとしても暖かい。',
      'エンテーテの力さえ、',
      'この炎には届かない。',
      '',
      'ここで生存者たちは束の間の休息を得る。',
      '',
      '互いの傷を見せ合い、',
      '試練で学んだことを共有し、',
      '次の狩りに備える。',
    ],
    gap: 120,
  },
  {
    lines: [
      '【 第六章：脱出ゲート 】',
    ],
    gap: 60,
    scene: renderGateScene,
  },
  {
    lines: [
      '全ての発電機が修理されると、',
      '脱出ゲートに電力が供給される。',
      '',
      'レバーに手をかけた瞬間、',
      '背後から心臓の鼓動のような音が',
      '近づいてくるのがわかる。',
      '',
      '震える手でゲートを開き、',
      '光の中に飛び込む。',
      '',
      '助かった――',
      '',
      '......はずだった。',
      '',
      '',
      '',
      '目を開けると、',
      'そこには見慣れた焚き火があった。',
      '',
      '脱出の先にあるのは、自由ではない。',
      '次の試練の始まりに過ぎない。',
    ],
    gap: 140,
  },
  {
    lines: [
      '【 終章：永遠の試練 】',
    ],
    gap: 60,
    scene: renderEntityScene,
  },
  {
    lines: [
      'こうして試練は繰り返される。',
      '',
      '終わりはない。',
      '脱出しても、倒れても、',
      '霧がすべてを元に戻す。',
      '',
      'それでも彼らは走り続ける。',
      '',
      '暗闇の中で仲間を探し、',
      '震える手で発電機を回し、',
      '板を倒してキラーの足を止め、',
      '血を流しながらゲートを目指す。',
      '',
      '',
      'なぜなら――',
      '',
      '諦めた瞬間、',
      'エンテーテが最も喜ぶのだから。',
    ],
    gap: 200,
  },
  {
    lines: [
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      'Ｄ Ｏ Ｔ 　 Ｂ Ｙ 　 Ｄ Ｏ Ｔ',
      '',
      '― ESC でメニューに戻る ―',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ],
    gap: 400,
  },
];

// ─── State ───

let scrollY = 0;
let startTime = 0;
let initialized = false;
const SCROLL_SPEED = 35; // pixels per second
const LINE_HEIGHT = 28;
const SCENE_HEIGHT = 180;
const SCENE_GAP = 20;

export function resetStoryScene(): void {
  scrollY = 0;
  startTime = 0;
  initialized = false;
}

export function updateStoryScene(_dt: number): void {
  if (!initialized) {
    startTime = Date.now() / 1000;
    initialized = true;
  }
  const elapsed = Date.now() / 1000 - startTime;
  scrollY = elapsed * SCROLL_SPEED;
}

export function renderStoryScene(ctx: CanvasRenderingContext2D): void {
  const t = Date.now() / 1000;
  const CX = CANVAS_WIDTH / 2;

  // ─── Background ───
  ctx.fillStyle = '#020102';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Subtle vignette
  const grd = ctx.createRadialGradient(CX, CANVAS_HEIGHT / 2, 50, CX, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.7);
  grd.addColorStop(0, 'rgba(20, 5, 8, 0.3)');
  grd.addColorStop(0.5, 'rgba(5, 2, 3, 0.7)');
  grd.addColorStop(1, 'rgba(0, 0, 0, 1)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Drifting particles
  ctx.globalAlpha = 0.04;
  for (let i = 0; i < 8; i++) {
    const px = CX + Math.sin(t * 0.2 + i * 1.7) * 300;
    const py = CANVAS_HEIGHT / 2 + Math.cos(t * 0.15 + i * 2.3) * 200;
    const pr = 40 + Math.sin(t * 0.3 + i) * 15;
    const fog = ctx.createRadialGradient(px, py, 0, px, py, pr);
    fog.addColorStop(0, '#882233');
    fog.addColorStop(1, 'transparent');
    ctx.fillStyle = fog;
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }
  ctx.globalAlpha = 1;

  // ─── Scrolling content ───
  let contentY = CANVAS_HEIGHT * 0.55 - scrollY; // start near center

  ctx.textAlign = 'center';

  for (const segment of STORY_SEGMENTS) {
    // Render scene if present
    if (segment.scene) {
      const sceneCenterY = contentY + SCENE_HEIGHT / 2;
      // Only render if visible
      if (sceneCenterY > -SCENE_HEIGHT && sceneCenterY < CANVAS_HEIGHT + SCENE_HEIGHT) {
        // Fade in/out based on position
        const distFromCenter = Math.abs(sceneCenterY - CANVAS_HEIGHT / 2);
        const sceneAlpha = Math.max(0, 1 - distFromCenter / (CANVAS_HEIGHT * 0.6));
        ctx.save();
        ctx.globalAlpha = sceneAlpha;
        segment.scene(ctx, CX, sceneCenterY, t);
        ctx.restore();
      }
      contentY += SCENE_HEIGHT + SCENE_GAP;
    }

    // Render text lines
    for (const line of segment.lines) {
      if (contentY > -LINE_HEIGHT && contentY < CANVAS_HEIGHT + LINE_HEIGHT) {
        // Fade based on distance from center
        const distFromCenter = Math.abs(contentY - CANVAS_HEIGHT / 2);
        const textAlpha = Math.max(0, 1 - distFromCenter / (CANVAS_HEIGHT * 0.55));

        ctx.save();
        ctx.globalAlpha = textAlpha;

        if (line.startsWith('━')) {
          // Decorative line
          ctx.fillStyle = '#663333';
          ctx.font = '14px monospace';
          ctx.fillText(line, CX, contentY);
        } else if (line.startsWith('Ｄ')) {
          // Title text
          ctx.shadowColor = '#ff1133';
          ctx.shadowBlur = 15;
          ctx.fillStyle = '#cc2244';
          ctx.font = 'bold 22px monospace';
          ctx.fillText(line, CX, contentY);
          ctx.shadowBlur = 0;
        } else if (line.startsWith('【')) {
          // Chapter title
          ctx.shadowColor = '#ff4444';
          ctx.shadowBlur = 10;
          ctx.fillStyle = '#ff3344';
          ctx.font = 'bold 18px monospace';
          ctx.fillText(line, CX, contentY);
          ctx.shadowBlur = 0;
        } else if (line.startsWith('～') || line.startsWith('―')) {
          // Subtitle
          ctx.fillStyle = '#886655';
          ctx.font = '14px monospace';
          ctx.fillText(line, CX, contentY);
        } else if (line.startsWith('「')) {
          // Dialogue
          ctx.fillStyle = '#ddcc88';
          ctx.font = '14px monospace';
          ctx.fillText(line, CX, contentY);
        } else if (line.startsWith('　')) {
          // Continuation of dialogue
          ctx.fillStyle = '#ddcc88';
          ctx.font = '14px monospace';
          ctx.fillText(line, CX, contentY);
        } else {
          // Normal text
          ctx.fillStyle = '#bbaaaa';
          ctx.font = '14px monospace';
          ctx.fillText(line, CX, contentY);
        }

        ctx.restore();
      }
      contentY += LINE_HEIGHT;
    }

    contentY += (segment.gap ?? 80);
  }

  // ─── Top/bottom fade gradients ───
  const fadeH = 80;
  const topFade = ctx.createLinearGradient(0, 0, 0, fadeH);
  topFade.addColorStop(0, '#020102');
  topFade.addColorStop(1, 'rgba(2,1,2,0)');
  ctx.fillStyle = topFade;
  ctx.fillRect(0, 0, CANVAS_WIDTH, fadeH);

  const botFade = ctx.createLinearGradient(0, CANVAS_HEIGHT - fadeH, 0, CANVAS_HEIGHT);
  botFade.addColorStop(0, 'rgba(2,1,2,0)');
  botFade.addColorStop(1, '#020102');
  ctx.fillStyle = botFade;
  ctx.fillRect(0, CANVAS_HEIGHT - fadeH, CANVAS_WIDTH, fadeH);

  // ─── Scanlines ───
  ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
  for (let sy = 0; sy < CANVAS_HEIGHT; sy += 3) {
    ctx.fillRect(0, sy, CANVAS_WIDTH, 1);
  }

  // ─── Bottom hint ───
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#555';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ESC: メニューに戻る', CX, CANVAS_HEIGHT - 12);
  ctx.restore();

  ctx.textAlign = 'left';
}

// ═══════════════════════════════════════════════════════
//  Pixel art scenes for story mode
// ═══════════════════════════════════════════════════════

/** Scene 1 & Final: The Entity "Pixel" emerging from darkness */
function renderEntityScene(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, t: number,
): void {
  const p = 3;

  // Dark aura
  const auraR = 60 + Math.sin(t * 1.5) * 10;
  const aura = ctx.createRadialGradient(cx, cy, 5, cx, cy, auraR);
  aura.addColorStop(0, `rgba(200, 20, 40, ${0.3 + Math.sin(t * 2) * 0.1})`);
  aura.addColorStop(0.5, `rgba(80, 5, 15, ${0.15 + Math.sin(t * 2.5) * 0.05})`);
  aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = aura;
  ctx.fillRect(cx - auraR, cy - auraR, auraR * 2, auraR * 2);

  // Giant eye shape
  const eyeW = 20 * p;
  const eyeH = 10 * p;
  const eyeX = cx - eyeW / 2;
  const eyeY = cy - eyeH / 2;

  // Eye outline (dark mass)
  ctx.fillStyle = '#1a0505';
  ctx.fillRect(eyeX - 4 * p, eyeY + 2 * p, eyeW + 8 * p, eyeH - 4 * p);
  ctx.fillRect(eyeX - 2 * p, eyeY, eyeW + 4 * p, eyeH);
  ctx.fillRect(eyeX, eyeY - p, eyeW, eyeH + 2 * p);

  // Red iris
  const irisShift = Math.sin(t * 0.8) * 3 * p;
  const irisX = cx - 4 * p + irisShift;
  const irisY = cy - 3 * p;
  ctx.fillStyle = '#881122';
  ctx.fillRect(irisX, irisY, 8 * p, 6 * p);
  ctx.fillStyle = '#cc1133';
  ctx.fillRect(irisX + p, irisY + p, 6 * p, 4 * p);

  // Pupil
  ctx.fillStyle = '#000';
  ctx.fillRect(irisX + 2 * p, irisY + p, 4 * p, 4 * p);

  // Pupil glint
  const glint = 0.5 + Math.sin(t * 3) * 0.3;
  ctx.fillStyle = `rgba(255, 200, 200, ${glint})`;
  ctx.fillRect(irisX + 2 * p, irisY + p, p, p);

  // Tendrils reaching out
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + t * 0.3;
    const len = 30 + Math.sin(t * 2 + i * 1.5) * 10;
    const tx = cx + Math.cos(angle) * len;
    const ty = cy + Math.sin(angle) * len * 0.6;
    ctx.fillStyle = `rgba(120, 10, 20, ${0.3 - i * 0.04})`;
    // Draw tendril as series of dots
    for (let j = 0; j < 5; j++) {
      const frac = j / 5;
      const dx = cx + (tx - cx) * frac;
      const dy = cy + (ty - cy) * frac;
      ctx.fillRect(dx - p / 2, dy - p / 2, p, p);
    }
  }
}

/** Scene 2: Fog-filled maze */
function renderFogScene(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, t: number,
): void {
  const p = 3;
  const wallColor = '#3a3a5c';
  const floorColor = '#1a1a2e';

  // Draw a mini maze
  const startX = cx - 70;
  const startY = cy - 40;
  const tileSize = 8 * p;

  // Simple maze layout (0=floor, 1=wall)
  const maze = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1, 0, 1],
    [1, 0, 1, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ];

  for (let row = 0; row < maze.length; row++) {
    for (let col = 0; col < maze[row].length; col++) {
      const tx = startX + col * tileSize;
      const ty = startY + row * tileSize;
      ctx.fillStyle = maze[row][col] ? wallColor : floorColor;
      ctx.fillRect(tx, ty, tileSize, tileSize);
      if (maze[row][col]) {
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(tx, ty, tileSize, p);
      }
    }
  }

  // Fog overlay with BFS-like reveal around survivor
  const survX = startX + 3 * tileSize + tileSize / 2;
  const survY = startY + 4 * tileSize + tileSize / 2;
  const fogR = 2.5 * tileSize;

  // Fog (covers everything except near survivor)
  for (let row = 0; row < maze.length; row++) {
    for (let col = 0; col < maze[row].length; col++) {
      const tx = startX + col * tileSize + tileSize / 2;
      const ty = startY + row * tileSize + tileSize / 2;
      const dist = Math.sqrt((tx - survX) ** 2 + (ty - survY) ** 2);
      if (dist > fogR) {
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(startX + col * tileSize, startY + row * tileSize, tileSize, tileSize);
      } else if (dist > fogR * 0.7) {
        ctx.fillStyle = `rgba(0,0,0,${0.3 + (dist - fogR * 0.7) / fogR * 0.6})`;
        ctx.fillRect(startX + col * tileSize, startY + row * tileSize, tileSize, tileSize);
      }
    }
  }

  // Mini survivor in maze
  const bobY = Math.sin(t * 4) * p;
  ctx.fillStyle = '#00ff88';
  ctx.fillRect(survX - 2 * p, survY - 4 * p + bobY, 4 * p, 3 * p); // body
  ctx.fillStyle = '#ddb89a';
  ctx.fillRect(survX - 1.5 * p, survY - 6 * p + bobY, 3 * p, 2.5 * p); // head
}

/** Scene 3: Killer stalking */
function renderKillerScene(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, t: number,
): void {
  const p = 3;

  // Ground
  const groundY = cy + 30;
  ctx.fillStyle = '#1a120e';
  ctx.fillRect(cx - 120, groundY, 240, 30);

  // Blood trail
  for (let i = 0; i < 8; i++) {
    const bx = cx - 80 + i * 22 + Math.sin(i * 2.7) * 5;
    const by = groundY - p + Math.sin(i * 1.3) * 2;
    ctx.fillStyle = `rgba(120, 10, 15, ${0.3 + Math.sin(i) * 0.1})`;
    ctx.fillRect(bx, by, 3 * p, p);
  }

  // Trapper (left side)
  const tx = cx - 50;
  const sway = Math.sin(t * 0.5) * p;
  // Body
  ctx.fillStyle = '#1a0a0a';
  ctx.fillRect(tx - 4 * p + sway, groundY - 16 * p, 8 * p, 14 * p);
  // Hood
  ctx.fillStyle = '#2a1010';
  ctx.fillRect(tx - 3 * p + sway, groundY - 22 * p, 7 * p, 7 * p);
  ctx.fillRect(tx - 4 * p + sway, groundY - 20 * p, 9 * p, 5 * p);
  // Eyes
  const eyeGlow = 0.7 + Math.sin(t * 2.5) * 0.3;
  ctx.fillStyle = `rgba(255, 30, 30, ${eyeGlow})`;
  ctx.fillRect(tx - p + sway, groundY - 18 * p, 1.5 * p, p);
  ctx.fillRect(tx + 2 * p + sway, groundY - 18 * p, 1.5 * p, p);
  // Weapon
  ctx.fillStyle = '#556';
  ctx.fillRect(tx + 5 * p + sway, groundY - 20 * p, 2 * p, 18 * p);
  ctx.fillStyle = '#778';
  ctx.fillRect(tx + 4 * p + sway, groundY - 22 * p, 4 * p, 3 * p);

  // Huntress (right side)
  const hx = cx + 50;
  const hsway = Math.sin(t * 0.5 + 1) * p;
  // Body
  ctx.fillStyle = '#2a1515';
  ctx.fillRect(hx - 4 * p + hsway, groundY - 16 * p, 8 * p, 14 * p);
  // Head with bunny mask
  ctx.fillStyle = '#ddd';
  ctx.fillRect(hx - 3 * p + hsway, groundY - 22 * p, 6 * p, 7 * p);
  // Bunny ears
  ctx.fillStyle = '#ccc';
  ctx.fillRect(hx - 2 * p + hsway, groundY - 28 * p, 2 * p, 7 * p);
  ctx.fillRect(hx + 2 * p + hsway, groundY - 28 * p, 2 * p, 7 * p);
  // Eyes on mask
  ctx.fillStyle = '#000';
  ctx.fillRect(hx - 2 * p + hsway, groundY - 19 * p, 1.5 * p, 1.5 * p);
  ctx.fillRect(hx + 2 * p + hsway, groundY - 19 * p, 1.5 * p, 1.5 * p);
  // Axe
  ctx.fillStyle = '#654';
  ctx.fillRect(hx - 7 * p + hsway, groundY - 18 * p, 2 * p, 14 * p);
  ctx.fillStyle = '#889';
  ctx.fillRect(hx - 9 * p + hsway, groundY - 20 * p, 4 * p, 4 * p);

  // Terror radius indicator (red glow around killers)
  const terrorR = 40 + Math.sin(t * 1.5) * 5;
  for (const kx of [tx, hx]) {
    const terror = ctx.createRadialGradient(kx, cy, 5, kx, cy, terrorR);
    terror.addColorStop(0, `rgba(255, 20, 40, ${0.06 + Math.sin(t * 2) * 0.02})`);
    terror.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = terror;
    ctx.fillRect(kx - terrorR, cy - terrorR, terrorR * 2, terrorR * 2);
  }
}

/** Scene 4: Survivors */
function renderSurvivorScene(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, t: number,
): void {
  const p = 3;
  const groundY = cy + 30;

  // Ground
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(cx - 120, groundY, 240, 30);

  // Generator
  const genX = cx;
  const genY = groundY - 2 * p;
  ctx.fillStyle = '#556677';
  ctx.fillRect(genX - 6 * p, genY - 8 * p, 12 * p, 8 * p);
  ctx.fillStyle = '#445566';
  ctx.fillRect(genX - 5 * p, genY - 7 * p, 10 * p, 6 * p);
  // Pistons
  const pistonBob = Math.sin(t * 6) * p;
  ctx.fillStyle = '#778899';
  ctx.fillRect(genX - 4 * p, genY - 10 * p + pistonBob, 2 * p, 3 * p);
  ctx.fillRect(genX + 2 * p, genY - 10 * p - pistonBob, 2 * p, 3 * p);
  // Sparks
  if (Math.sin(t * 8) > 0.5) {
    ctx.fillStyle = '#ffcc44';
    ctx.fillRect(genX + Math.sin(t * 12) * 4 * p, genY - 9 * p, p, p);
  }
  // Progress bar
  const progress = ((t * 0.15) % 1);
  ctx.fillStyle = '#333';
  ctx.fillRect(genX - 6 * p, genY - 11 * p, 12 * p, 2 * p);
  ctx.fillStyle = '#ffcc00';
  ctx.fillRect(genX - 6 * p, genY - 11 * p, 12 * p * progress, 2 * p);

  // Dwight (left, repairing)
  const dX = cx - 30;
  const dbob = Math.sin(t * 3) * p * 0.5;
  // Body
  ctx.fillStyle = '#00ff88';
  ctx.fillRect(dX - 3 * p, groundY - 12 * p + dbob, 6 * p, 8 * p);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(dX + 2 * p, groundY - 12 * p + dbob, 2 * p, 8 * p);
  // Head
  ctx.fillStyle = '#ddb89a';
  ctx.fillRect(dX - 2 * p, groundY - 16 * p + dbob, 5 * p, 5 * p);
  // Hair
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(dX - 2 * p, groundY - 17 * p + dbob, 6 * p, 2 * p);
  // Legs
  ctx.fillStyle = '#2a3a5a';
  ctx.fillRect(dX - 2 * p, groundY - 4 * p, 2 * p, 4 * p);
  ctx.fillRect(dX + p, groundY - 4 * p, 2 * p, 4 * p);
  // Arms reaching to generator
  ctx.fillStyle = '#ddb89a';
  ctx.fillRect(dX + 3 * p, groundY - 10 * p + dbob, 5 * p, 2 * p);

  // Fenley (right, repairing)
  const fX = cx + 30;
  const fbob = Math.sin(t * 3 + 1) * p * 0.5;
  // Body
  ctx.fillStyle = '#00ccff';
  ctx.fillRect(fX - 3 * p, groundY - 12 * p + fbob, 6 * p, 8 * p);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(fX - 3 * p, groundY - 12 * p + fbob, 2 * p, 8 * p);
  // Head
  ctx.fillStyle = '#ddb89a';
  ctx.fillRect(fX - 2 * p, groundY - 16 * p + fbob, 5 * p, 5 * p);
  // Hair
  ctx.fillStyle = '#5a3a2a';
  ctx.fillRect(fX - 2 * p, groundY - 17 * p + fbob, 6 * p, 2 * p);
  // Legs
  ctx.fillStyle = '#2a3a5a';
  ctx.fillRect(fX - 2 * p, groundY - 4 * p, 2 * p, 4 * p);
  ctx.fillRect(fX + p, groundY - 4 * p, 2 * p, 4 * p);
  // Arms reaching to generator
  ctx.fillStyle = '#ddb89a';
  ctx.fillRect(fX - 7 * p, groundY - 10 * p + fbob, 5 * p, 2 * p);
}

/** Scene 5: Campfire between trials */
function renderCampfireStoryScene(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, t: number,
): void {
  const p = 2.5;
  const groundY = cy + 35;

  // Ground
  ctx.fillStyle = '#1a120e';
  ctx.fillRect(cx - 100, groundY, 200, 25);

  // Fire glow
  const glowR = 50 + Math.sin(t * 3) * 5;
  const glow = ctx.createRadialGradient(cx, groundY - 10, 3, cx, groundY - 10, glowR);
  glow.addColorStop(0, `rgba(255, 120, 30, ${0.15 + Math.sin(t * 4) * 0.05})`);
  glow.addColorStop(0.5, `rgba(200, 60, 10, ${0.06})`);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - glowR, groundY - glowR - 10, glowR * 2, glowR * 2);

  // Logs
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(cx - 6 * p, groundY - 2 * p, 12 * p, 2 * p);

  // Fire
  const flameColors = ['#ff4400', '#ff6600', '#ff8800', '#ffaa00', '#ffcc00'];
  for (let i = 0; i < 6; i++) {
    const fx = cx + (((i * 17 + 3) * 7 % 10) - 5) * p;
    const flicker = Math.sin(t * (6 + i * 1.3) + i * 17) * 0.5 + 0.5;
    const fh = (2 + Math.floor(flicker * 4)) * p;
    const fy = groundY - 2 * p - fh;
    const ci = Math.min(flameColors.length - 1, Math.floor(flicker * flameColors.length));
    ctx.fillStyle = flameColors[ci];
    ctx.fillRect(fx, fy, 2 * p, fh);
  }

  // Sparks
  ctx.fillStyle = '#ffcc44';
  for (let i = 0; i < 3; i++) {
    const phase = (t * 2 + i * 1.7) % 3;
    const sx = cx + Math.sin(t * 1.5 + i * 2.3) * 6;
    const sy = groundY - 8 * p - phase * 10;
    ctx.globalAlpha = (1 - phase / 3) * 0.7;
    ctx.fillRect(sx, sy, p, p);
  }
  ctx.globalAlpha = 1;

  // Survivors sitting around
  // Left survivor
  renderMiniSitting(ctx, cx - 40, groundY, p, t, '#00ff88', false);
  // Right survivor
  renderMiniSitting(ctx, cx + 30, groundY, p, t + 0.5, '#00ccff', true);

  // Speech bubble hint
  const bubbleAlpha = (Math.sin(t * 1.5) * 0.5 + 0.5) * 0.6;
  ctx.save();
  ctx.globalAlpha = bubbleAlpha;
  ctx.fillStyle = '#fff';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('...', cx - 40, groundY - 30 * p);
  ctx.restore();
}

function renderMiniSitting(
  ctx: CanvasRenderingContext2D,
  x: number, groundY: number,
  p: number, t: number,
  color: string, flipX: boolean,
): void {
  const sway = Math.sin(t * 0.7) * 0.5;
  const sx = x + sway;
  const dir = flipX ? -1 : 1;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(sx - 3 * p, groundY - p, 6 * p, 2 * p);

  // Legs (sitting)
  ctx.fillStyle = '#2a3a5a';
  ctx.fillRect(sx - p, groundY - 3 * p, 5 * p * (dir || 1), 2 * p);

  // Body
  ctx.fillStyle = color;
  ctx.fillRect(sx - 2 * p, groundY - 9 * p, 5 * p, 6 * p);

  // Head
  ctx.fillStyle = '#ddb89a';
  ctx.fillRect(sx - 1.5 * p, groundY - 13 * p, 4 * p, 4 * p);

  // Hair
  ctx.fillStyle = color === '#00ff88' ? '#3a2a1a' : '#5a3a2a';
  ctx.fillRect(sx - 2 * p, groundY - 14 * p, 5 * p, 2 * p);
}

/** Scene 6: Exit gate */
function renderGateScene(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, t: number,
): void {
  const p = 3;
  const groundY = cy + 30;

  // Ground
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(cx - 120, groundY, 240, 30);

  // Gate pillars
  const gateW = 60;
  for (const side of [-1, 1]) {
    const pillarX = cx + side * gateW - 4 * p;
    ctx.fillStyle = '#555566';
    ctx.fillRect(pillarX, groundY - 25 * p, 8 * p, 25 * p);
    ctx.fillStyle = '#666677';
    ctx.fillRect(pillarX + p, groundY - 24 * p, 6 * p, 23 * p);
    // Top cap
    ctx.fillStyle = '#777788';
    ctx.fillRect(pillarX - p, groundY - 27 * p, 10 * p, 3 * p);
  }

  // Gate lever
  const leverX = cx - gateW - 10 * p;
  ctx.fillStyle = '#445';
  ctx.fillRect(leverX, groundY - 10 * p, 3 * p, 10 * p);
  // Lever handle
  const leverAngle = Math.sin(t * 0.5) * 0.2;
  ctx.fillStyle = '#ff8844';
  ctx.fillRect(leverX - p, groundY - 12 * p + leverAngle * 10, 5 * p, 3 * p);

  // Light through gate (pulsing)
  const lightPulse = 0.3 + Math.sin(t * 2) * 0.15;
  const gateLight = ctx.createRadialGradient(cx, cy - 5 * p, 5, cx, cy - 5 * p, gateW);
  gateLight.addColorStop(0, `rgba(255, 220, 150, ${lightPulse})`);
  gateLight.addColorStop(0.5, `rgba(255, 180, 80, ${lightPulse * 0.4})`);
  gateLight.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gateLight;
  ctx.fillRect(cx - gateW, groundY - 25 * p, gateW * 2, 25 * p);

  // Status lights on pillars (3 lights each)
  for (const side of [-1, 1]) {
    const lx = cx + side * gateW;
    for (let i = 0; i < 3; i++) {
      const ly = groundY - 22 * p + i * 6 * p;
      const litProgress = ((t * 0.3) % 1) * 3;
      const isLit = i < litProgress;
      ctx.fillStyle = isLit ? '#ff4444' : '#331111';
      ctx.fillRect(lx - p, ly, 2 * p, 2 * p);
      if (isLit) {
        ctx.fillStyle = `rgba(255, 50, 50, ${0.3})`;
        ctx.fillRect(lx - 2 * p, ly - p, 4 * p, 4 * p);
      }
    }
  }

  // Survivor silhouette running toward gate
  const runProgress = (t * 0.4) % 3;
  if (runProgress < 2) {
    const runX = cx - 80 + runProgress * 60;
    const runBob = Math.sin(t * 8) * p;
    ctx.fillStyle = '#00ff88';
    ctx.fillRect(runX - 2 * p, groundY - 10 * p + runBob, 4 * p, 6 * p);
    ctx.fillStyle = '#ddb89a';
    ctx.fillRect(runX - 1.5 * p, groundY - 13 * p + runBob, 3 * p, 3 * p);
    // Legs (running)
    const legAnim = Math.sin(t * 10);
    ctx.fillStyle = '#2a3a5a';
    ctx.fillRect(runX - p + legAnim * p, groundY - 4 * p, 2 * p, 4 * p);
    ctx.fillRect(runX + p - legAnim * p, groundY - 4 * p, 2 * p, 4 * p);
  }
}
