/**
 * Pixel-art campfire scene for the title screen bottom half.
 * Two survivors sit by a campfire, a killer lurks behind a distant tree.
 */

export function renderCampfireScene(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  baseY: number,
  width: number,
): void {
  const t = Date.now() / 1000;
  const p = 3; // pixel unit for scene sprites

  // Ground line
  const groundY = baseY + 50;
  ctx.fillStyle = '#1a120e';
  ctx.fillRect(centerX - width / 2, groundY, width, 60);
  // Grass tufts
  ctx.fillStyle = '#1e2a12';
  for (let i = 0; i < 30; i++) {
    const gx = centerX - width / 2 + ((i * 47 + 13) % width);
    const gh = 2 + (i % 3) * 2;
    ctx.fillRect(gx, groundY - gh, 2, gh);
  }

  // ─── Distant tree (right side, far back) with killer ───
  renderDistantTree(ctx, centerX + 200, groundY, p, t);

  // ─── Campfire (center-left) ───
  const fireX = centerX - 80;
  renderCampfire(ctx, fireX, groundY, p, t);

  // ─── Survivor 1 (left of fire, sitting, facing right) ───
  renderSittingSurvivor(ctx, fireX - 45, groundY, p, t, '#00ff88', false);

  // ─── Survivor 2 (right of fire, sitting, facing left) ───
  renderSittingSurvivor(ctx, fireX + 30, groundY, p, t + 0.5, '#00ccff', true);
}

function renderCampfire(
  ctx: CanvasRenderingContext2D,
  x: number, groundY: number,
  p: number, t: number,
): void {
  // Fire glow on ground
  const glowR = 40 + Math.sin(t * 3) * 5;
  const glow = ctx.createRadialGradient(x, groundY - 8, 2, x, groundY - 8, glowR);
  glow.addColorStop(0, `rgba(255, 120, 30, ${0.15 + Math.sin(t * 4) * 0.05})`);
  glow.addColorStop(0.5, `rgba(200, 60, 10, ${0.06 + Math.sin(t * 3) * 0.02})`);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - glowR, groundY - glowR - 8, glowR * 2, glowR * 2);

  // Logs (brown cross)
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(x - 8 * p, groundY - 2 * p, 16 * p, 2 * p);
  ctx.fillStyle = '#4a2e16';
  ctx.fillRect(x - 3 * p, groundY - 2 * p, 6 * p, 2 * p);
  // Cross log
  ctx.save();
  ctx.translate(x, groundY - p);
  ctx.rotate(Math.PI * 0.25);
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(-7 * p, -p, 14 * p, 2 * p);
  ctx.restore();

  // Stones around fire
  ctx.fillStyle = '#444';
  const stonePositions = [-7, -5, -3, 3, 5, 7];
  for (const sx of stonePositions) {
    ctx.fillRect(x + sx * p - p, groundY - p, 2 * p, 2 * p);
  }
  ctx.fillStyle = '#555';
  ctx.fillRect(x - 8 * p, groundY - p, 2 * p, p);
  ctx.fillRect(x + 6 * p, groundY - p, 2 * p, p);

  // Fire flames (animated pixel blocks)
  const flameColors = ['#ff4400', '#ff6600', '#ff8800', '#ffaa00', '#ffcc00', '#ffee66'];
  for (let i = 0; i < 8; i++) {
    const seed = i * 17 + 3;
    const fx = x + (((seed * 7) % 12) - 6) * p;
    const flicker = Math.sin(t * (6 + i * 1.3) + seed) * 0.5 + 0.5;
    const fh = (3 + Math.floor(flicker * 5)) * p;
    const fy = groundY - 2 * p - fh;
    const colorIdx = Math.min(flameColors.length - 1, Math.floor(flicker * flameColors.length));
    ctx.fillStyle = flameColors[colorIdx];
    ctx.fillRect(fx, fy, 2 * p, fh);
    // Brighter core
    if (i < 4) {
      ctx.fillStyle = flameColors[Math.min(flameColors.length - 1, colorIdx + 2)];
      ctx.fillRect(fx, fy + p, p, fh - p);
    }
  }

  // Sparks flying up
  ctx.fillStyle = '#ffcc44';
  for (let i = 0; i < 5; i++) {
    const sparkPhase = (t * 2 + i * 1.7) % 3;
    const sparkX = x + Math.sin(t * 1.5 + i * 2.3) * 8;
    const sparkY = groundY - 10 * p - sparkPhase * 12;
    const sparkAlpha = 1 - sparkPhase / 3;
    ctx.globalAlpha = sparkAlpha * 0.7;
    ctx.fillRect(sparkX, sparkY, p, p);
  }
  ctx.globalAlpha = 1;

  // Smoke wisps
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 3; i++) {
    const smokePhase = (t * 0.8 + i * 1.1) % 4;
    const smokeX = x + Math.sin(t * 0.5 + i * 2) * 15;
    const smokeY = groundY - 15 * p - smokePhase * 20;
    const smokeR = 5 + smokePhase * 4;
    const smoke = ctx.createRadialGradient(smokeX, smokeY, 0, smokeX, smokeY, smokeR);
    smoke.addColorStop(0, '#888');
    smoke.addColorStop(1, 'transparent');
    ctx.fillStyle = smoke;
    ctx.fillRect(smokeX - smokeR, smokeY - smokeR, smokeR * 2, smokeR * 2);
  }
  ctx.globalAlpha = 1;
}

function renderSittingSurvivor(
  ctx: CanvasRenderingContext2D,
  x: number, groundY: number,
  p: number, t: number,
  shirtColor: string,
  facingLeft: boolean,
): void {
  const dir = facingLeft ? -1 : 1;
  // Gentle sway
  const sway = Math.sin(t * 0.7) * 0.5;
  const sx = x + sway;

  // Shadow under character
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(sx - 4 * p, groundY - p, 8 * p, 2 * p);

  // Legs (bent, sitting)
  ctx.fillStyle = '#2a3a5a';
  // Thigh (horizontal)
  ctx.fillRect(sx - 2 * p, groundY - 4 * p, 6 * p * dir || 6 * p, 2 * p);
  // Lower leg (vertical)
  ctx.fillRect(sx + (facingLeft ? -4 : 3) * p, groundY - 4 * p, 2 * p, 4 * p);

  // Body (torso, sitting upright)
  const bodyX = sx - 3 * p;
  const bodyY = groundY - 12 * p;
  ctx.fillStyle = shirtColor;
  ctx.fillRect(bodyX, bodyY, 6 * p, 8 * p);
  // Darker side
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(facingLeft ? bodyX : bodyX + 4 * p, bodyY, 2 * p, 8 * p);

  // Arms (reaching toward fire)
  ctx.fillStyle = '#ddb89a';
  const armY = bodyY + 3 * p;
  ctx.fillRect(sx + dir * 3 * p, armY, 4 * p * dir || 4 * p, 2 * p);
  // Hand
  ctx.fillRect(sx + dir * 6 * p, armY - p, 2 * p, 3 * p);

  // Head
  const headX = sx - 2 * p;
  const headY = bodyY - 5 * p;
  ctx.fillStyle = '#ddb89a';
  ctx.fillRect(headX, headY, 5 * p, 5 * p);
  // Hair
  ctx.fillStyle = shirtColor === '#00ff88' ? '#3a2a1a' : '#5a3a2a';
  ctx.fillRect(headX - p, headY - p, 7 * p, 2 * p);
  ctx.fillRect(facingLeft ? headX + 4 * p : headX - p, headY, 2 * p, 3 * p);

  // Eye (facing the fire)
  ctx.fillStyle = '#222';
  const eyeX = facingLeft ? headX + p : headX + 3 * p;
  ctx.fillRect(eyeX, headY + 2 * p, p, p);

  // Fire reflection in eye
  ctx.fillStyle = `rgba(255, 150, 50, ${0.4 + Math.sin(t * 4) * 0.2})`;
  ctx.fillRect(eyeX, headY + 2 * p, p, p);
}

function renderDistantTree(
  ctx: CanvasRenderingContext2D,
  x: number, groundY: number,
  p: number, t: number,
): void {
  // Tree is further back, drawn slightly smaller
  const tp = p * 0.8;

  // Tree trunk
  ctx.fillStyle = '#2a1e14';
  ctx.fillRect(x - 3 * tp, groundY - 40 * tp, 6 * tp, 40 * tp);
  // Bark texture
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(x - 2 * tp, groundY - 35 * tp, 2 * tp, 8 * tp);
  ctx.fillRect(x + tp, groundY - 20 * tp, 2 * tp, 6 * tp);

  // Tree canopy (dark, ominous)
  ctx.fillStyle = '#0e1a0e';
  const canopyY = groundY - 40 * tp;
  // Main canopy mass
  ctx.fillRect(x - 18 * tp, canopyY - 20 * tp, 36 * tp, 22 * tp);
  ctx.fillRect(x - 22 * tp, canopyY - 14 * tp, 44 * tp, 14 * tp);
  ctx.fillRect(x - 15 * tp, canopyY - 25 * tp, 30 * tp, 8 * tp);
  // Slightly lighter patches
  ctx.fillStyle = '#142214';
  ctx.fillRect(x - 10 * tp, canopyY - 18 * tp, 8 * tp, 6 * tp);
  ctx.fillRect(x + 5 * tp, canopyY - 12 * tp, 10 * tp, 8 * tp);

  // ─── Killer lurking behind tree ───
  renderLurkingKiller(ctx, x, groundY, tp, t);
}

function renderLurkingKiller(
  ctx: CanvasRenderingContext2D,
  treeX: number, groundY: number,
  tp: number, t: number,
): void {
  // Killer peeks from the left side of the tree
  const kx = treeX - 8 * tp;
  const ky = groundY - 28 * tp;

  // Slight sway (breathing / menacing)
  const sway = Math.sin(t * 0.6) * tp;

  // Dark body silhouette (partially hidden by tree)
  ctx.fillStyle = '#1a0a0a';
  ctx.fillRect(kx - 4 * tp + sway, ky + 6 * tp, 6 * tp, 16 * tp);

  // Hood / head
  ctx.fillStyle = '#1a0a0a';
  ctx.fillRect(kx - 3 * tp + sway, ky, 6 * tp, 7 * tp);
  ctx.fillRect(kx - 4 * tp + sway, ky + tp, 7 * tp, 5 * tp);

  // Glowing eye (the only clearly visible feature — menacing)
  const eyeGlow = 0.6 + Math.sin(t * 2) * 0.3;
  ctx.fillStyle = `rgba(255, 30, 30, ${eyeGlow})`;
  ctx.fillRect(kx - tp + sway, ky + 3 * tp, tp * 1.5, tp);
  // Eye glow effect
  ctx.fillStyle = `rgba(255, 50, 30, ${eyeGlow * 0.3})`;
  ctx.fillRect(kx - 2 * tp + sway, ky + 2 * tp, tp * 4, tp * 3);

  // Second eye (dimmer, partially hidden)
  ctx.fillStyle = `rgba(255, 30, 30, ${eyeGlow * 0.4})`;
  ctx.fillRect(kx + 2 * tp + sway, ky + 3 * tp, tp, tp);

  // Weapon silhouette (blade peeking out)
  ctx.fillStyle = '#2a1a1a';
  ctx.fillRect(kx + 3 * tp + sway, ky + 10 * tp, 2 * tp, 12 * tp);
  // Blade glint
  ctx.fillStyle = `rgba(180, 180, 200, ${0.1 + Math.sin(t * 3 + 1) * 0.08})`;
  ctx.fillRect(kx + 3 * tp + sway, ky + 12 * tp, tp, 8 * tp);
}
