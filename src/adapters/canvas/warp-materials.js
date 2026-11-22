/**
 * Close-up procedural materials and middle-distance architecture for Warp's
 * five circuits. The material shader follows track geometry so details have
 * correct perspective instead of behaving like a scrolling screen overlay.
 *
 * These are bounded Canvas 2D paths: no per-frame textures, network assets,
 * random noise, blur filters or WebGL dependency.
 *
 * @import { Scene } from './warp-scenery.js'
 */

/** @typedef {{ x: number, y: number, scale: number, depth: number }} Point */
/** @typedef {{ left: Point, right: Point, stretch: number }} RoadRow */
const TAU = Math.PI * 2;
const HORIZON = 272;
const PAD = 110;

/** @param {number} a @param {number} b */
function noise(a, b) {
  let seed = (Math.imul(a + 11, 1597334677) ^ Math.imul(b + 47, 3812015801)) >>> 0;
  seed ^= seed >>> 16;
  seed = Math.imul(seed, 2246822519) >>> 0;
  return (seed ^ (seed >>> 13)) / 4294967296;
}

/** @param {number} value @param {number} period */
const wrap = (value, period) => ((value % period) + period) % period;

/** @param {RoadRow} row @param {number} x */
const across = (row, x) => ({
  x: row.left.x + (row.right.x - row.left.x) * x,
  y: row.left.y,
});

/**
 * Put a diagonal or longitudinal streak on the physical surface.
 * @param {CanvasRenderingContext2D} ctx
 * @param {RoadRow} near
 * @param {RoadRow} far
 * @param {number} x1
 * @param {number} x2
 * @param {string} color
 */
function seam(ctx, near, far, x1, x2, color) {
  const a = across(near, x1);
  const b = across(far, x2);
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/**
 * Mechanical joints, fine grooves, hairline fractures, and tiny granules fade
 * with distance. They never obscure the track center or gameplay targets.
 *
 * @param {Scene} scene
 * @param {RoadRow} near
 * @param {RoadRow} far
 */
export function drawSurfaceMaterial({ ctx, look }, near, far) {
  const scale = near.left.scale;
  if (scale < 0.27 || far.left.y >= near.left.y || near.left.depth > 92) return;

  const kind = look.skyline;
  const index = near.stretch;
  const fade = Math.min(1, (scale - 0.24) * 1.75);
  const stripe = 'rgba(' + look.haze + ', ' + (0.09 + fade * 0.12) + ')';
  const cut = 'rgba(2, 6, 23, ' + (0.12 + fade * 0.22) + ')';
  const reflection = 'rgba(' + look.edge + ', ' + (0.06 + fade * 0.12) + ')';

  ctx.save();
  ctx.lineWidth = Math.max(0.6, scale * 0.9);
  ctx.lineCap = 'round';

  if (kind === 'city' || kind === 'planet' || kind === 'core') {
    // Fabricated deck plates with recessed longitudinal service grooves.
    for (const x of [0.115, 0.22, 0.78, 0.885]) {
      seam(ctx, near, far, x, x, cut);
    }
    if (index % 3 === 0) {
      ctx.strokeStyle = cut;
      ctx.beginPath();
      const l = across(near, 0.09);
      const r = across(near, 0.91);
      ctx.moveTo(l.x, l.y - 1);
      ctx.lineTo(r.x, r.y - 1);
      ctx.stroke();
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = stripe;
      ctx.beginPath();
      ctx.moveTo(l.x, l.y + 1);
      ctx.lineTo(r.x, r.y + 1);
      ctx.stroke();
    }
    if (index % 4 === 0 && scale > 0.4) {
      // Track-side countersunk fasteners follow correct projected boundaries.
      for (const row of [near, far]) {
        for (const x of [0.125, 0.875]) {
          const p = across(row, x);
          ctx.fillStyle = 'rgba(10, 17, 32, ' + (fade * 0.6) + ')';
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.75, row.left.scale * 1.6), 0, TAU);
          ctx.fill();
          ctx.strokeStyle = 'rgba(203, 213, 225, ' + (fade * 0.33) + ')';
          ctx.lineWidth = 0.65;
          ctx.beginPath();
          ctx.moveTo(p.x - 0.8, p.y - 0.45);
          ctx.lineTo(p.x + 0.8, p.y + 0.45);
          ctx.stroke();
        }
      }
    }
  } else if (kind === 'mesas') {
    // Ancient compacted stone: irregular geological cracks and worn joint faces.
    for (let fracture = 0; fracture < 3; fracture += 1) {
      const from = 0.17 + noise(index, 44 + fracture) * 0.65;
      const to = from + (noise(index, 61 + fracture) - 0.5) * 0.1;
      seam(ctx, near, far, from, to, fracture === 0 ? stripe : cut);
    }
    if (index % 4 === 0) {
      const l = across(near, 0.12);
      const m = across(near, 0.53);
      const r = across(near, 0.88);
      ctx.strokeStyle = 'rgba(234, 179, 8, ' + (0.06 + 0.14 * fade) + ')';
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(m.x, m.y - Math.max(1, scale * 3.2));
      ctx.lineTo(r.x, r.y);
      ctx.stroke();
    }
  } else {
    // Cloud Nine's smooth ceramic deck: pearly brushed streaks and soft seams.
    if (index % 2 === 0) {
      seam(ctx, near, far, 0.14, 0.15, stripe);
      seam(ctx, near, far, 0.85, 0.84, reflection);
    }
    if (index % 5 === 0) {
      const l = across(near, 0.24);
      const r = across(near, 0.76);
      ctx.strokeStyle = 'rgba(224, 231, 255, ' + (fade * 0.15) + ')';
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(r.x, r.y);
      ctx.stroke();
    }
  }

  // Extremely faint isolated wear flecks: seeded by distance, never by time.
  // Four marks maximum per near segment, irrespective of device resolution.
  if (scale > 0.38) {
    for (let mark = 0; mark < 4; mark += 1) {
      const x = 0.15 + noise(index * 7 + mark, 83) * 0.7;
      const t = 0.12 + noise(index * 9 + mark, 84) * 0.72;
      const nearSpot = across(near, x);
      const farSpot = across(far, x);
      const px = nearSpot.x + (farSpot.x - nearSpot.x) * t;
      const py = nearSpot.y + (farSpot.y - nearSpot.y) * t;
      ctx.fillStyle = mark % 2 ? cut : reflection;
      ctx.fillRect(px, py, Math.max(0.6, scale * 2.5), Math.max(0.6, scale * 1.25));
    }
  }
  ctx.restore();
}

/**
 * Architectural depth placed between the course's existing landmarks and its
 * atmospheric haze. The silhouettes sit above the horizon, so they never
 * suggest extra collision hazards on the track.
 *
 * @param {Scene} scene
 */
export function drawWorldArchitecture({ ctx, look, config, view, race, still, now }) {
  const width = config.width;
  const size = width + PAD * 2;
  const movement = -view.heading * 53 - race.z * 0.012;
  const theme = look.skyline;
  const time = still ? 0 : now;

  ctx.save();
  ctx.beginPath();
  ctx.rect(-PAD, -PAD, size, HORIZON + PAD);
  ctx.clip();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (theme === 'city') {
    // Near-sky tramways, balcony supports and inset windows behind the roadway.
    for (let n = 0; n < 8; n += 1) {
      const x = wrap(n * 117 + noise(n, 4) * 45 + movement * 1.45, size) - PAD;
      const h = 39 + noise(n, 5) * 76;
      const w = 17 + noise(n, 6) * 19;
      const top = HORIZON - h;
      ctx.fillStyle = 'rgba(9, 8, 31, 0.67)';
      ctx.fillRect(x, top, w, h);
      ctx.fillStyle = 'rgba(57, 45, 93, 0.32)';
      ctx.fillRect(x + w * 0.7, top + 3, w * 0.25, h - 4);
      ctx.strokeStyle = 'rgba(233, 154, 174, 0.32)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, top, w, h);
      for (let floor = 0; floor < 7; floor += 1) {
        const y = top + 7 + floor * (h - 12) / 7;
        ctx.fillStyle = noise(n * 9 + floor, 17) > 0.46
          ? 'rgba(255, 203, 142, 0.39)' : 'rgba(103, 232, 249, 0.19)';
        ctx.fillRect(x + 4, y, w * 0.23, Math.max(1, h * 0.027));
      }
      if (n % 3 === 0) {
        ctx.strokeStyle = 'rgba(103, 232, 249, 0.22)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.5, top - 12);
        ctx.lineTo(x + w * 0.5, top);
        ctx.stroke();
      }
    }
  } else if (theme === 'mesas') {
    // Geological layers lit by distant aurora: a 2D rocky relief study.
    for (let n = 0; n < 7; n += 1) {
      const x = wrap(n * 137 + movement * 1.3 + 24, size) - PAD;
      const w = 45 + noise(n, 34) * 41;
      const h = 34 + noise(n, 35) * 42;
      ctx.beginPath();
      ctx.moveTo(x - 6, HORIZON);
      ctx.lineTo(x + w * 0.13, HORIZON - h);
      ctx.lineTo(x + w * 0.69, HORIZON - h - 3);
      ctx.lineTo(x + w, HORIZON - h * 0.82);
      ctx.lineTo(x + w + 17, HORIZON);
      ctx.closePath();
      ctx.fillStyle = 'rgba(12, 47, 39, 0.47)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(171, 127, 93, 0.29)';
      ctx.lineWidth = 1;
      ctx.stroke();
      for (let layer = 0; layer < 5; layer += 1) {
        const y = HORIZON - h * (0.12 + 0.15 * layer);
        ctx.strokeStyle = layer % 2 ? 'rgba(94, 234, 212, 0.14)' : 'rgba(251, 146, 60, 0.17)';
        ctx.beginPath();
        ctx.moveTo(x + w * (0.13 + 0.02 * layer), y);
        ctx.lineTo(x + w * (0.89 - 0.02 * layer), y + 1.8);
        ctx.stroke();
      }
    }
  } else if (theme === 'clouds') {
    // Dense cloud shelf shadowing under bright vapor crowns, three parallax levels.
    for (let layer = 0; layer < 3; layer += 1) {
      const drift = movement * (0.4 + layer * 0.47) + time * (still ? 0 : 0.00022 * (layer + 1));
      for (let n = 0; n < 5; n += 1) {
        const x = wrap(n * 171 + noise(n, layer + 44) * 83 + drift, size) - PAD;
        const y = 164 + layer * 28 + noise(n, 48 + layer) * 22;
        const radius = 27 + noise(n, 51 + layer) * 31;
        ctx.fillStyle = layer === 0 ? 'rgba(216, 180, 254, 0.12)'
          : layer === 1 ? 'rgba(196, 181, 253, 0.18)' : 'rgba(165, 180, 252, 0.22)';
        ctx.beginPath();
        ctx.ellipse(x, y, radius * 1.75, radius * 0.44, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(224, 231, 255, 0.10)';
        ctx.beginPath();
        ctx.ellipse(x - radius * 0.22, y - radius * 0.29, radius * 0.78, radius * 0.31, -0.12, Math.PI, TAU);
        ctx.fill();
      }
    }
  } else if (theme === 'planet') {
    // Orbital shipyards: small solar-panel arrays and triangulated service trusses.
    for (let n = 0; n < 5; n += 1) {
      const x = wrap(n * 203 + movement * 0.9 + 38, size) - PAD;
      const y = 64 + noise(n, 70) * 112;
      const widthPanel = 14 + noise(n, 71) * 15;
      const h = 10 + noise(n, 72) * 9;
      ctx.strokeStyle = 'rgba(165, 180, 252, 0.38)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - widthPanel * 2, y);
      ctx.lineTo(x + widthPanel * 2, y);
      ctx.stroke();
      for (const side of [-1, 1]) {
        ctx.fillStyle = 'rgba(40, 58, 128, 0.59)';
        ctx.fillRect(x + side * widthPanel - widthPanel * 0.45, y - h * 0.5, widthPanel * 0.92, h);
        ctx.strokeStyle = 'rgba(129, 140, 248, 0.55)';
        ctx.strokeRect(x + side * widthPanel - widthPanel * 0.45, y - h * 0.5, widthPanel * 0.92, h);
        for (let line = 0; line < 3; line += 1) {
          const sy = y - h * 0.38 + line * h * 0.38;
          ctx.beginPath();
          ctx.moveTo(x + side * widthPanel - widthPanel * 0.4, sy);
          ctx.lineTo(x + side * widthPanel + widthPanel * 0.4, sy);
          ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(251, 191, 36, 0.55)';
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, TAU);
      ctx.fill();
    }
  } else if (theme === 'core') {
    // Repeated insulated conduits feeding into a faint converging reactor grid.
    const cx = view.vanish.x;
    const cy = view.vanish.y;
    for (const side of [-1, 1]) {
      for (let line = 0; line < 5; line += 1) {
        const x = cx + side * (49 + line * 25);
        const y = cy - 20 - line * 14;
        ctx.strokeStyle = 'rgba(251, 113, 133, ' + (0.09 + line * 0.018) + ')';
        ctx.lineWidth = line % 2 ? 1.7 : 1;
        ctx.beginPath();
        ctx.moveTo(cx + side * 24, cy);
        ctx.lineTo(x, y);
        ctx.lineTo(x + side * 22, y - 29);
        ctx.stroke();
      }
    }
    for (let n = 0; n < 7; n += 1) {
      const s = 8 + n * 7 + wrap(race.z * 0.027, 6);
      ctx.strokeStyle = 'rgba(253, 164, 175, ' + (0.11 + (n % 3) * 0.04) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, s, Math.PI * 1.09, Math.PI * 1.91);
      ctx.stroke();
    }
  }
  ctx.restore();
}
