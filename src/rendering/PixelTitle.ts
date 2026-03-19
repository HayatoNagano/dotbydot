/**
 * Pixel-art bitmap title renderer for "dot by dot".
 * Large, bold, horror-styled with heavy blood drips and glow effects.
 */

// 7-wide × 9-tall bitmap font — chunky bold style
const GLYPHS: Record<string, number[]> = {
  D: [
    0b1111100,
    0b1100110,
    0b1100011,
    0b1100011,
    0b1100011,
    0b1100011,
    0b1100011,
    0b1100110,
    0b1111100,
  ],
  O: [
    0b0111110,
    0b1100011,
    0b1100011,
    0b1100011,
    0b1100011,
    0b1100011,
    0b1100011,
    0b1100011,
    0b0111110,
  ],
  T: [
    0b1111111,
    0b1111111,
    0b0001100,
    0b0001100,
    0b0001100,
    0b0001100,
    0b0001100,
    0b0001100,
    0b0001100,
  ],
  B: [
    0b1111100,
    0b1100110,
    0b1100110,
    0b1111100,
    0b1111100,
    0b1100110,
    0b1100011,
    0b1100011,
    0b1111110,
  ],
  Y: [
    0b1100011,
    0b1100011,
    0b0110110,
    0b0011100,
    0b0001100,
    0b0001100,
    0b0001100,
    0b0001100,
    0b0001100,
  ],
};

const PIXEL = 8;
const GLYPH_W = 7;
const GLYPH_H = 9;

// "DOT" on top, "BY" middle (smaller), "DOT" bottom — or single line
// Let's do a dramatic single line with variable sizing
const MAIN_WORD = 'DOT';
const MID_WORD = 'BY';

// Blood drip state — persistent across frames for smooth animation
const drips: { x: number; y: number; speed: number; len: number; seed: number }[] = [];
let dripsInitialized = false;

function initDrips(startX: number, startY: number, totalW: number, totalH: number): void {
  if (dripsInitialized) return;
  dripsInitialized = true;
  for (let i = 0; i < 20; i++) {
    const seed = i * 37 + 13;
    drips.push({
      x: startX + (seed * 7 + i * 43) % Math.floor(totalW),
      y: startY + totalH + Math.random() * 5,
      speed: 15 + Math.random() * 25,
      len: 10 + Math.random() * 30,
      seed,
    });
  }
}

export function renderPixelTitle(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
): void {
  const t = Date.now() / 1000;
  const P = PIXEL;
  const mainP = P;        // Main "DOT" pixel size
  const midP = P - 2;     // "BY" slightly smaller

  // Calculate layout: DOT · BY · DOT
  const mainLetterW = GLYPH_W * mainP;
  const mainGap = 3 * mainP;
  const midLetterW = GLYPH_W * midP;
  const midGapPx = 2 * midP;

  const dotW = 3 * mainLetterW + 2 * mainP; // D-O-T + inner gaps
  const byW = 2 * midLetterW + midGapPx;
  const totalW = dotW + mainGap + byW + mainGap + dotW;
  const mainH = GLYPH_H * mainP;
  const midH = GLYPH_H * midP;

  const startX = centerX - totalW / 2;
  const mainY = centerY - mainH / 2;
  const midY = centerY - midH / 2;

  initDrips(startX, mainY, totalW, mainH);

  // ─── Background glow layers ───
  // Outer red halo
  const pulseR = 120 + Math.sin(t * 1.5) * 30;
  const haloGrad = ctx.createRadialGradient(
    centerX, centerY, 20,
    centerX, centerY, pulseR + totalW * 0.4,
  );
  haloGrad.addColorStop(0, `rgba(200, 20, 40, ${0.12 + Math.sin(t * 2) * 0.04})`);
  haloGrad.addColorStop(0.5, `rgba(120, 5, 15, ${0.06 + Math.sin(t * 2.5) * 0.02})`);
  haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = haloGrad;
  ctx.fillRect(startX - 100, mainY - 80, totalW + 200, mainH + 160);

  // ─── Render each section ───
  ctx.save();
  ctx.shadowColor = '#ff1133';
  ctx.shadowBlur = 20 + Math.sin(t * 3) * 8;

  let cursorX = startX;

  // First "DOT"
  renderWord(ctx, MAIN_WORD, cursorX, mainY, mainP, t, 0);
  cursorX += dotW + mainGap;

  // "BY"
  ctx.shadowBlur = 10 + Math.sin(t * 3) * 4;
  renderWord(ctx, MID_WORD, cursorX, midY, midP, t, 3);
  cursorX += byW + mainGap;

  // Second "DOT"
  ctx.shadowBlur = 20 + Math.sin(t * 3 + 1) * 8;
  renderWord(ctx, MAIN_WORD, cursorX, mainY, mainP, t, 5);

  ctx.restore();

  // ─── Animated blood drips ───
  renderBloodDrips(ctx, t, mainY + mainH);

  // ─── Slash mark across title ───
  renderSlash(ctx, startX, mainY, totalW, mainH, t);

  // ─── Hook silhouette ───
  renderHookIcon(ctx, startX - 50, mainY - 10, mainH, t);
  renderKnifeIcon(ctx, startX + totalW + 15, mainY - 5, mainH, t);
}

function renderWord(
  ctx: CanvasRenderingContext2D,
  word: string,
  x: number,
  y: number,
  pixelSize: number,
  t: number,
  charOffset: number,
): void {
  const letterSpacing = pixelSize; // 1-pixel gap between letters
  let cx = x;

  for (let ci = 0; ci < word.length; ci++) {
    const ch = word[ci];
    const glyph = GLYPHS[ch];
    if (!glyph) { cx += GLYPH_W * pixelSize + letterSpacing; continue; }

    const idx = ci + charOffset;
    // Per-letter subtle float animation
    const floatY = Math.sin(t * 1.2 + idx * 0.9) * 2;

    for (let row = 0; row < GLYPH_H; row++) {
      const bits = glyph[row];
      for (let col = 0; col < GLYPH_W; col++) {
        if (!(bits & (1 << (GLYPH_W - 1 - col)))) continue;

        const px = cx + col * pixelSize;
        const py = y + row * pixelSize + floatY;

        // Color — deep blood red with per-pixel variation
        const wave = Math.sin(t * 2 + idx * 0.7 + row * 0.3 + col * 0.2);
        const r = Math.floor(180 + wave * 30);
        const g = Math.floor(15 + wave * 8);
        const b = Math.floor(25 + wave * 10);

        // Main block
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(px, py, pixelSize, pixelSize);

        // 3D effect: top-left highlight
        const hlAlpha = 0.2 + Math.sin(t * 3 + idx + row * 0.3) * 0.05;
        ctx.fillStyle = `rgba(255, 120, 100, ${hlAlpha})`;
        ctx.fillRect(px, py, pixelSize, Math.ceil(pixelSize * 0.3));
        ctx.fillRect(px, py, Math.ceil(pixelSize * 0.3), pixelSize);

        // 3D effect: bottom-right shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(px + pixelSize * 0.7, py + pixelSize * 0.7, pixelSize * 0.3, pixelSize * 0.3);
        ctx.fillRect(px, py + pixelSize * 0.8, pixelSize, pixelSize * 0.2);
        ctx.fillRect(px + pixelSize * 0.8, py, pixelSize * 0.2, pixelSize);

        // Edge glow on outermost pixels
        const isEdge =
          row === 0 || row === GLYPH_H - 1 ||
          col === 0 || col === GLYPH_W - 1 ||
          !(glyph[row - 1] & (1 << (GLYPH_W - 1 - col))) ||
          !(glyph[row + 1]?.valueOf() !== undefined ? glyph[row + 1] & (1 << (GLYPH_W - 1 - col)) : false) ||
          !(bits & (1 << (GLYPH_W - col))) ||
          !(bits & (1 << (GLYPH_W - 2 - col)));
        if (isEdge) {
          const edgeGlow = 0.08 + Math.sin(t * 4 + px * 0.02) * 0.04;
          ctx.fillStyle = `rgba(255, 50, 50, ${edgeGlow})`;
          ctx.fillRect(px - 1, py - 1, pixelSize + 2, pixelSize + 2);
        }
      }
    }

    cx += GLYPH_W * pixelSize + letterSpacing;
  }
}

function renderBloodDrips(ctx: CanvasRenderingContext2D, t: number, bottomY: number): void {
  for (const drip of drips) {
    // Animate downward with loop
    const cycle = 4 + drip.seed % 3;
    const progress = ((t * drip.speed * 0.03 + drip.seed) % cycle) / cycle;
    const dripY = bottomY + progress * (drip.len + 30);
    // drip length shrinks as it falls

    // Main drip stream
    const alpha = 0.6 - progress * 0.4;
    ctx.fillStyle = `rgba(140, 10, 20, ${alpha})`;
    ctx.fillRect(drip.x, bottomY, 3, dripY - bottomY);

    // Drip bulb at bottom
    ctx.fillStyle = `rgba(170, 15, 25, ${alpha})`;
    const bulbR = 3 + Math.sin(t + drip.seed) * 1;
    ctx.fillRect(drip.x - 1, dripY - bulbR, 5, bulbR * 2);

    // Highlight on drip
    ctx.fillStyle = `rgba(255, 80, 80, ${alpha * 0.3})`;
    ctx.fillRect(drip.x, bottomY, 1, dripY - bottomY);
  }
}

function renderSlash(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  t: number,
): void {
  // Diagonal slash marks across the title
  ctx.save();
  ctx.globalAlpha = 0.08 + Math.sin(t * 2) * 0.03;

  // Three parallel scratches
  for (let i = 0; i < 3; i++) {
    const sx = x + w * 0.15 + i * 12;
    const sy = y - 5 + i * 3;
    const ex = x + w * 0.75 + i * 12;
    const ey = y + h + 10 + i * 3;

    ctx.strokeStyle = 'rgba(255, 200, 180, 0.3)';
    ctx.lineWidth = 2 - i * 0.4;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  ctx.restore();
}

function renderHookIcon(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  _h: number, t: number,
): void {
  const sway = Math.sin(t * 0.8) * 3;
  ctx.save();
  ctx.globalAlpha = 0.15 + Math.sin(t * 1.5) * 0.05;

  // Chain links
  const chainX = x + 15 + sway;
  ctx.fillStyle = '#666';
  for (let i = 0; i < 4; i++) {
    const cy = y + i * 12;
    ctx.fillRect(chainX - 2, cy, 4, 8);
    ctx.fillRect(chainX - 3, cy + 2, 6, 4);
  }

  // Hook shape
  const hookY = y + 48;
  ctx.fillStyle = '#888';
  ctx.fillRect(chainX - 2 + sway, hookY, 4, 20);
  ctx.fillRect(chainX + sway, hookY + 18, 12, 4);
  ctx.fillRect(chainX + 10 + sway, hookY + 10, 4, 12);
  // Point
  ctx.fillStyle = '#aaa';
  ctx.fillRect(chainX + 8 + sway, hookY + 8, 4, 4);

  ctx.restore();
}

function renderKnifeIcon(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  _h: number, t: number,
): void {
  ctx.save();
  const glint = 0.12 + Math.sin(t * 2.5) * 0.06;
  ctx.globalAlpha = glint;

  // Handle
  ctx.fillStyle = '#6B4226';
  ctx.fillRect(x + 8, y, 8, 24);
  // Guard
  ctx.fillStyle = '#555';
  ctx.fillRect(x + 4, y + 22, 16, 4);
  // Blade
  ctx.fillStyle = '#99a';
  ctx.fillRect(x + 8, y + 26, 8, 50);
  ctx.fillRect(x + 6, y + 26, 4, 40);
  // Blade highlight
  ctx.fillStyle = '#bbc';
  ctx.fillRect(x + 8, y + 26, 3, 50);
  // Tip
  ctx.fillStyle = '#aab';
  ctx.fillRect(x + 8, y + 74, 6, 4);
  ctx.fillRect(x + 10, y + 78, 4, 3);
  // Blood
  ctx.fillStyle = 'rgba(160, 10, 20, 0.7)';
  ctx.fillRect(x + 12, y + 40, 4, 15);
  ctx.fillRect(x + 10, y + 50, 3, 10);

  ctx.restore();
}
