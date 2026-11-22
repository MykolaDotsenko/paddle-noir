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
 * Put diagonal or longitudinal streaks of one color on the physical surface, as one stroke:
 * a stroke apiece cost a phone more than the hairlines are worth.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {RoadRow} near
 * @param {RoadRow} far
 * @param {readonly (readonly [number, number])[]} streaks where each starts across the near
 *   edge, and ends across the far edge, as shares of the lane
 * @param {string} color
 */
function seams(ctx, near, far, streaks, color) {
  ctx.strokeStyle = color;
  ctx.beginPath();
  for (const [x1, x2] of streaks) {
    const a = across(near, x1);
    const b = across(far, x2);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
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
    seams(ctx, near, far, [[0.115, 0.115], [0.22, 0.22], [0.78, 0.78], [0.885, 0.885]], cut);
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
      const heads = [near, far].flatMap((row) => [0.125, 0.875].map((x) => ({ ...across(row, x), r: Math.max(0.75, row.left.scale * 1.6) })));
      ctx.fillStyle = 'rgba(10, 17, 32, ' + (fade * 0.6) + ')';
      ctx.beginPath();
      for (const p of heads) {
        ctx.moveTo(p.x + p.r, p.y);
        ctx.arc(p.x, p.y, p.r, 0, TAU);
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(203, 213, 225, ' + (fade * 0.33) + ')';
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      for (const p of heads) {
        ctx.moveTo(p.x - 0.8, p.y - 0.45);
        ctx.lineTo(p.x + 0.8, p.y + 0.45);
      }
      ctx.stroke();
    }
  } else if (kind === 'mesas') {
    // Ancient compacted stone: irregular geological cracks and worn joint faces.
    /** @type {[number, number][]} */
    const fractures = [];
    for (let fracture = 0; fracture < 5; fracture += 1) {
      const from = 0.17 + noise(index, 44 + fracture) * 0.65;
      fractures.push([from, from + (noise(index, 61 + fracture) - 0.5) * 0.1]);
    }
    seams(ctx, near, far, fractures.slice(0, 1), stripe);
    seams(ctx, near, far, fractures.slice(1), cut);
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
      seams(ctx, near, far, [[0.14, 0.15], [0.29, 0.3]], stripe);
      seams(ctx, near, far, [[0.51, 0.5], [0.7, 0.69], [0.85, 0.84]], reflection);
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
    const fleck = { w: Math.max(0.6, scale * 2.5), h: Math.max(0.6, scale * 1.25) };
    for (const [first, color] of /** @type {const} */ ([[0, reflection], [1, cut]])) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let mark = first; mark < 4; mark += 2) {
        const x = 0.15 + noise(index * 7 + mark, 83) * 0.7;
        const t = 0.12 + noise(index * 9 + mark, 84) * 0.72;
        const nearSpot = across(near, x);
        const farSpot = across(far, x);
        ctx.rect(nearSpot.x + (farSpot.x - nearSpot.x) * t, nearSpot.y + (farSpot.y - nearSpot.y) * t, fleck.w, fleck.h);
      }
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * One path, filled or stroked in one color.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {'fill' | 'stroke'} how
 * @param {string} color
 * @param {() => void} trace adds the path's shapes
 */
function paths(ctx, how, color, trace) {
  ctx.beginPath();
  trace();
  if (how === 'fill') {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.stroke();
  }
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

  // Each kind of part is one path across all the structures that have it: a fill or stroke
  // apiece cost a phone far more than these few, faint shapes are worth.
  if (theme === 'city') {
    // Near-sky tramways, balcony supports and inset windows behind the roadway.
    const towers = Array.from({ length: 8 }, (_, n) => {
      const h = 39 + noise(n, 5) * 76;
      return { n, x: wrap(n * 117 + noise(n, 4) * 45 + movement * 1.45, size) - PAD, h, w: 17 + noise(n, 6) * 19, top: HORIZON - h };
    });
    ctx.lineWidth = 1;
    paths(ctx, 'fill', 'rgba(9, 8, 31, 0.67)', () => towers.forEach(({ x, top, w, h }) => ctx.rect(x, top, w, h)));
    paths(ctx, 'fill', 'rgba(57, 45, 93, 0.32)', () => towers.forEach(({ x, top, w, h }) => ctx.rect(x + w * 0.7, top + 3, w * 0.25, h - 4)));
    paths(ctx, 'stroke', 'rgba(233, 154, 174, 0.32)', () => towers.forEach(({ x, top, w, h }) => ctx.rect(x, top, w, h)));
    for (const lit of [true, false]) {
      paths(ctx, 'fill', lit ? 'rgba(255, 203, 142, 0.39)' : 'rgba(103, 232, 249, 0.19)', () => {
        for (const { n, x, top, w, h } of towers) {
          for (let floor = 0; floor < 7; floor += 1) {
            if ((noise(n * 9 + floor, 17) > 0.46) === lit) {
              ctx.rect(x + 4, top + 7 + floor * (h - 12) / 7, w * 0.23, Math.max(1, h * 0.027));
            }
          }
        }
      });
    }
    ctx.lineWidth = 1.3;
    paths(ctx, 'stroke', 'rgba(103, 232, 249, 0.22)', () => {
      for (const { n, x, top, w } of towers) {
        if (n % 3 === 0) {
          ctx.moveTo(x + w * 0.5, top - 12);
          ctx.lineTo(x + w * 0.5, top);
        }
      }
    });
  } else if (theme === 'mesas') {
    // Geological layers lit by distant aurora: a 2D rocky relief study.
    const rocks = Array.from({ length: 7 }, (_, n) => ({ x: wrap(n * 137 + movement * 1.3 + 24, size) - PAD, w: 45 + noise(n, 34) * 41, h: 34 + noise(n, 35) * 42 }));
    ctx.beginPath();
    for (const { x, w, h } of rocks) {
      ctx.moveTo(x - 6, HORIZON);
      ctx.lineTo(x + w * 0.13, HORIZON - h);
      ctx.lineTo(x + w * 0.69, HORIZON - h - 3);
      ctx.lineTo(x + w, HORIZON - h * 0.82);
      ctx.lineTo(x + w + 17, HORIZON);
      ctx.closePath();
    }
    ctx.fillStyle = 'rgba(12, 47, 39, 0.47)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(171, 127, 93, 0.29)';
    ctx.lineWidth = 1;
    ctx.stroke();
    for (const odd of [0, 1]) {
      paths(ctx, 'stroke', odd ? 'rgba(94, 234, 212, 0.14)' : 'rgba(251, 146, 60, 0.17)', () => {
        for (const { x, w, h } of rocks) {
          for (let layer = odd; layer < 5; layer += 2) {
            const y = HORIZON - h * (0.12 + 0.15 * layer);
            ctx.moveTo(x + w * (0.13 + 0.02 * layer), y);
            ctx.lineTo(x + w * (0.89 - 0.02 * layer), y + 1.8);
          }
        }
      });
    }
  } else if (theme === 'clouds') {
    // Dense cloud shelf shadowing under bright vapor crowns, three parallax levels.
    /** @type {{ x: number, y: number, radius: number }[]} */
    const crowns = [];
    for (let layer = 0; layer < 3; layer += 1) {
      const drift = movement * (0.4 + layer * 0.47) + time * (still ? 0 : 0.00022 * (layer + 1));
      paths(ctx, 'fill', layer === 0 ? 'rgba(216, 180, 254, 0.12)'
        : layer === 1 ? 'rgba(196, 181, 253, 0.18)' : 'rgba(165, 180, 252, 0.22)', () => {
        for (let n = 0; n < 5; n += 1) {
          const x = wrap(n * 171 + noise(n, layer + 44) * 83 + drift, size) - PAD;
          const y = 164 + layer * 28 + noise(n, 48 + layer) * 22;
          const radius = 27 + noise(n, 51 + layer) * 31;
          ctx.moveTo(x + radius * 1.75, y);
          ctx.ellipse(x, y, radius * 1.75, radius * 0.44, 0, 0, TAU);
          crowns.push({ x: x - radius * 0.22, y: y - radius * 0.29, radius });
        }
      });
    }
    paths(ctx, 'fill', 'rgba(224, 231, 255, 0.10)', () => {
      for (const { x, y, radius } of crowns) {
        // Where the arc starts, so no edge joins one crown to the next.
        ctx.moveTo(x - radius * 0.78 * Math.cos(0.12), y + radius * 0.78 * Math.sin(0.12));
        ctx.ellipse(x, y, radius * 0.78, radius * 0.31, -0.12, Math.PI, TAU);
        ctx.closePath();
      }
    });
  } else if (theme === 'planet') {
    // Orbital shipyards: small solar-panel arrays and triangulated service trusses.
    const yards = Array.from({ length: 5 }, (_, n) => ({ x: wrap(n * 203 + movement * 0.9 + 38, size) - PAD, y: 64 + noise(n, 70) * 112, span: 14 + noise(n, 71) * 15, h: 10 + noise(n, 72) * 9 }));
    const panels = yards.flatMap(({ x, y, span, h }) => [-1, 1].map((side) => ({ x: x + side * span, y, span, h })));
    ctx.lineWidth = 1;
    paths(ctx, 'stroke', 'rgba(165, 180, 252, 0.38)', () => yards.forEach(({ x, y, span }) => {
      ctx.moveTo(x - span * 2, y);
      ctx.lineTo(x + span * 2, y);
    }));
    paths(ctx, 'fill', 'rgba(40, 58, 128, 0.59)', () => panels.forEach(({ x, y, span, h }) => ctx.rect(x - span * 0.45, y - h * 0.5, span * 0.92, h)));
    paths(ctx, 'stroke', 'rgba(129, 140, 248, 0.55)', () => panels.forEach(({ x, y, span, h }) => {
      ctx.rect(x - span * 0.45, y - h * 0.5, span * 0.92, h);
      for (let line = 0; line < 3; line += 1) {
        const sy = y - h * 0.38 + line * h * 0.38;
        ctx.moveTo(x - span * 0.4, sy);
        ctx.lineTo(x + span * 0.4, sy);
      }
    }));
    paths(ctx, 'fill', 'rgba(251, 191, 36, 0.55)', () => yards.forEach(({ x, y }) => {
      ctx.moveTo(x + 2.5, y);
      ctx.arc(x, y, 2.5, 0, TAU);
    }));
  } else if (theme === 'core') {
    // Repeated insulated conduits feeding into a faint converging reactor grid.
    const cx = view.vanish.x;
    const cy = view.vanish.y;
    for (let line = 0; line < 5; line += 1) {
      ctx.lineWidth = line % 2 ? 1.7 : 1;
      paths(ctx, 'stroke', 'rgba(251, 113, 133, ' + (0.09 + line * 0.018) + ')', () => {
        for (const side of [-1, 1]) {
          const x = cx + side * (49 + line * 25);
          const y = cy - 20 - line * 14;
          ctx.moveTo(cx + side * 24, cy);
          ctx.lineTo(x, y);
          ctx.lineTo(x + side * 22, y - 29);
        }
      });
    }
    ctx.lineWidth = 1;
    for (let shade = 0; shade < 3; shade += 1) {
      paths(ctx, 'stroke', 'rgba(253, 164, 175, ' + (0.11 + shade * 0.04) + ')', () => {
        for (let n = shade; n < 7; n += 3) {
          const s = 8 + n * 7 + wrap(race.z * 0.027, 6);
          ctx.moveTo(cx + s * Math.cos(Math.PI * 1.09), cy + s * Math.sin(Math.PI * 1.09));
          ctx.arc(cx, cy, s, Math.PI * 1.09, Math.PI * 1.91);
        }
      });
    }
  }
  ctx.restore();
}
