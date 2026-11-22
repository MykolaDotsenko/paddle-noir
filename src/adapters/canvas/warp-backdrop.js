/**
 * Multi-plane procedural backdrops for Warp's five race locations.
 *
 * Distant geometry is painted before the course's iconic skyline, so existing suns,
 * mesas, planets, tunnel cores and near objects keep their occlusion and readability.
 * No textures, network requests, random state or WebGL context are required.
 *
 * @import { Scene } from './warp-scenery.js'
 */

const HORIZON = 272;
const PAD = 110;
const TAU = Math.PI * 2;

/** A repeatable noise sample. Background features may never flicker between frames.
 * @param {number} a
 * @param {number} b
 */
function sample(a, b) {
  let h = (Math.imul(a + 7, 2654435761) ^ Math.imul(b + 13, 2246822519)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** @param {number} value @param {number} span */
function wrap(value, span) {
  return ((value % span) + span) % span;
}

/**
 * The clouds, buildings and terrain sit at progressively different distances.
 * A short straight does not scroll the horizon too fast: racing progress moves
 * it slowly while the current bend makes nearer layers slide more visibly.
 *
 * @param {Scene} scene
 * @param {number} distance 0 for the horizon, 1 for the foremost background
 */
function offsetOf({ race, view }, distance) {
  return -view.heading * (26 + distance * 105) - race.z * (0.007 + distance * 0.015);
}

/**
 * High-altitude cirrus bands and distant aircraft lights over the sunset city.
 *
 * @param {Scene} scene
 */
function sunset(scene) {
  const { ctx, config, still, now } = scene;
  const { width } = config;
  const time = still ? 0 : now;
  ctx.save();
  ctx.lineCap = 'round';

  for (let layer = 0; layer < 3; layer += 1) {
    const shift = offsetOf(scene, layer / 2) + time * (still ? 0 : (layer + 1) * 0.00035);
    for (let index = 0; index < 6; index += 1) {
      const span = width + PAD * 2;
      const x = wrap(index * 139 + sample(index, layer + 2) * 95 + shift, span) - PAD;
      const y = 57 + layer * 38 + sample(index, layer + 21) * 43;
      const length = 40 + sample(index, layer + 32) * 115;

      ctx.beginPath();
      ctx.moveTo(x - length * 0.55, y + 3);
      ctx.bezierCurveTo(x - length * 0.24, y - 4, x + length * 0.12, y - 9, x + length * 0.56, y - 3);
      ctx.strokeStyle = layer === 0 ? 'rgba(251, 146, 160, 0.17)'
        : layer === 1 ? 'rgba(253, 186, 116, 0.19)' : 'rgba(244, 114, 182, 0.12)';
      ctx.lineWidth = 1.8 + layer * 2;
      ctx.stroke();

      // A second, finer sunlight edge suggests wispy cloud volume.
      ctx.strokeStyle = 'rgba(254, 202, 172, 0.14)';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(x - length * 0.4, y - 1);
      ctx.quadraticCurveTo(x, y - 10, x + length * 0.43, y - 6);
      ctx.stroke();
    }
  }

  // Air traffic moves against the skyline at a much slower parallax rate.
  // Tiny chevrons give scale without creating targets that resemble pickups.
  for (let index = 0; index < 5; index += 1) {
    const x = wrap(index * 170 + 27 + offsetOf(scene, 0.08) * 0.6, width + PAD * 2) - PAD;
    const y = 92 + sample(index, 71) * 93;
    const s = 1.5 + sample(index, 72) * 2.8;
    ctx.strokeStyle = 'rgba(251, 191, 136, 0.34)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - s, y + s * 0.3);
    ctx.lineTo(x, y);
    ctx.lineTo(x + s, y + s * 0.3);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Stratified geological ridges behind the main canyon walls.
 * Two wide silhouette planes make the canyon look like a place with actual scale.
 *
 * @param {Scene} scene
 */
function canyon(scene) {
  const { ctx, config } = scene;
  const span = config.width + PAD * 2;
  ctx.save();
  ctx.lineJoin = 'round';

  for (let layer = 0; layer < 2; layer += 1) {
    const drift = offsetOf(scene, layer * 0.75);
    const vertices = [];
    const step = span / 15;

    for (let index = 0; index <= 15; index += 1) {
      const plateau = Math.floor(index / 3);
      const tall = (layer === 0 ? 40 : 63) + sample(plateau, layer + 18) * 36;
      const stepDown = index % 3 === 0 ? 10 : 0;
      vertices.push({ x: -PAD + index * step + drift, y: HORIZON - tall + stepDown });
    }

    ctx.beginPath();
    ctx.moveTo(-PAD + drift, HORIZON);
    for (const vertex of vertices) ctx.lineTo(vertex.x, vertex.y);
    ctx.lineTo(-PAD + span + drift, HORIZON);
    ctx.closePath();
    ctx.fillStyle = layer === 0 ? 'rgba(8, 49, 47, 0.43)' : 'rgba(5, 34, 31, 0.61)';
    ctx.fill();

    ctx.strokeStyle = layer === 0 ? 'rgba(94, 234, 212, 0.23)' : 'rgba(251, 146, 60, 0.24)';
    ctx.lineWidth = layer === 0 ? 1 : 1.4;
    ctx.beginPath();
    vertices.forEach((vertex, index) => {
      if (index === 0) ctx.moveTo(vertex.x, vertex.y);
      else ctx.lineTo(vertex.x, vertex.y);
    });
    ctx.stroke();

    // Sedimentary ledges have a common slope but alternate lengths and elevation.
    ctx.strokeStyle = 'rgba(134, 239, 172, 0.15)';
    ctx.lineWidth = 1;
    for (let stratum = 0; stratum < 8; stratum += 1) {
      const x = -PAD + wrap(stratum * 117 + sample(stratum, layer + 83) * 31 + drift, span);
      const y = HORIZON - (layer === 0 ? 33 : 49) + (stratum % 3) * 12;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 20 + sample(stratum, 91) * 32, y + 2);
      ctx.stroke();
    }
  }

  // A fine sheet of dust across the canyon floor, behind the roadside cliffs.
  const dust = ctx.createLinearGradient(0, HORIZON - 72, 0, HORIZON + 14);
  dust.addColorStop(0, 'rgba(251, 146, 60, 0)');
  dust.addColorStop(0.65, 'rgba(251, 146, 60, 0.08)');
  dust.addColorStop(1, 'rgba(251, 146, 60, 0)');
  ctx.fillStyle = dust;
  ctx.fillRect(-PAD + 1, HORIZON - 72, span - 2, 86);
  ctx.restore();
}

/**
 * Backlit multi-lobe cumulus in three depth planes. The upper lobes catch a
 * lavender sun, while the lower shelf stays shadowed.
 *
 * @param {Scene} scene
 */
function clouds(scene) {
  const { ctx, config, still, now } = scene;
  const span = config.width + PAD * 2;
  const time = still ? 0 : now;
  ctx.save();

  for (let layer = 0; layer < 3; layer += 1) {
    const drifting = offsetOf(scene, layer / 2) + time * (layer + 1) * 0.00028;
    const upper = 124 + layer * 36;
    const color = layer === 0 ? '216, 180, 254' : layer === 1 ? '196, 181, 253' : '165, 180, 252';
    const light = ctx.createLinearGradient(0, upper - 42, 0, upper + 64);
    light.addColorStop(0, 'rgba(' + color + ', ' + (0.22 + layer * 0.035) + ')');
    light.addColorStop(0.54, 'rgba(' + color + ', ' + (0.13 + layer * 0.045) + ')');
    light.addColorStop(1, 'rgba(67, 56, 130, 0.13)');
    ctx.fillStyle = light;

    for (let index = 0; index < 6; index += 1) {
      const center = wrap(index * 134 + sample(index, layer + 41) * 73 + drifting, span) - PAD;
      const height = upper + sample(index, layer + 45) * 43;
      const r = 23 + sample(index, layer + 56) * 24;

      ctx.beginPath();
      ctx.ellipse(center - r * 0.55, height, r, r * 0.48, 0, 0, TAU);
      ctx.ellipse(center, height - r * 0.31, r * 0.72, r * 0.8, 0, 0, TAU);
      ctx.ellipse(center + r * 0.6, height, r * 0.85, r * 0.5, 0, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = 'rgba(243, 232, 255, 0.12)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(center - r * 0.14, height - r * 0.59, r * 0.48, r * 0.21, -0.2, Math.PI, TAU);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Dense but low-cost star clusters, nearby drifting debris and distant orbital
 * arcs. All positions derive from race progress instead of random animation.
 *
 * @param {Scene} scene
 */
function orbit(scene) {
  const { ctx, config } = scene;
  const { width, height } = config;
  ctx.save();

  const bandY = 84;
  const milky = ctx.createLinearGradient(0, bandY - 55, 0, bandY + 90);
  milky.addColorStop(0, 'rgba(129, 140, 248, 0)');
  milky.addColorStop(0.52, 'rgba(129, 140, 248, 0.085)');
  milky.addColorStop(1, 'rgba(129, 140, 248, 0)');
  ctx.fillStyle = milky;
  ctx.save();
  ctx.translate(width * 0.5, bandY);
  ctx.rotate(-0.24);
  ctx.fillRect(-width, -58, width * 2, 148);
  ctx.restore();

  for (let index = 0; index < 38; index += 1) {
    const x = wrap(sample(index, 104) * (width + PAD * 2) + offsetOf(scene, 0.12) * (0.3 + sample(index, 105)), width + PAD * 2) - PAD;
    const y = 18 + sample(index, 106) * (height * 0.59);
    const radius = 0.45 + sample(index, 107) * 1.5;
    const transparency = 0.2 + sample(index, 108) * 0.37;
    ctx.fillStyle = 'rgba(199, 210, 254, ' + transparency + ')';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
  }

  const arcX = width * 0.84 + offsetOf(scene, 0.05) * 0.4;
  const arcY = 166;
  for (let ring = 0; ring < 3; ring += 1) {
    ctx.strokeStyle = 'rgba(' + (ring === 1 ? '251, 191, 36' : '129, 140, 248') + ', ' + (0.11 + ring * 0.04) + ')';
    ctx.lineWidth = ring === 1 ? 2 : 1;
    ctx.beginPath();
    ctx.ellipse(arcX, arcY, 170 + ring * 18, 47 + ring * 9, -0.35, Math.PI * 1.03, Math.PI * 1.82);
    ctx.stroke();
  }

  // Four irregular distant asteroid silhouettes keep the orbit from feeling empty.
  for (let index = 0; index < 4; index += 1) {
    const x = wrap(index * 214 + 77 + offsetOf(scene, 0.75) * 1.5, width + PAD * 2) - PAD;
    const y = 145 + sample(index, 119) * 90;
    const r = 3 + sample(index, 120) * 6;
    ctx.beginPath();
    for (let corner = 0; corner < 6; corner += 1) {
      const angle = corner / 6 * TAU;
      const length = r * (0.74 + sample(index * 6 + corner, 121) * 0.45);
      const px = x + Math.cos(angle) * length;
      const py = y + Math.sin(angle) * length;
      if (corner === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(49, 46, 102, 0.6)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(165, 180, 252, 0.24)';
    ctx.lineWidth = 0.75;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Converging structural ribs and side-panel lights make the warp-core tunnel
 * look physically long, while the existing 3D-projected rings stay in front.
 *
 * @param {Scene} scene
 */
function tunnel(scene) {
  const { ctx, view, config, still, now } = scene;
  const centerX = view.vanish.x;
  const centerY = view.vanish.y;
  const far = Math.max(config.width, config.height) * 0.74;
  const pulse = still ? 0 : Math.sin(now / 1200) * 0.04;
  ctx.save();

  // Paired structural vanishing lines, subtle enough not to hide the road surface.
  for (let beam = 0; beam < 10; beam += 1) {
    const angle = (beam + 0.5) / 10 * TAU;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const length = far * (beam % 2 === 0 ? 1 : 0.8);
    ctx.strokeStyle = 'rgba(251, 113, 133, ' + (0.12 + pulse + (beam % 3) * 0.025) + ')';
    ctx.lineWidth = beam % 2 === 0 ? 1.4 : 0.9;
    ctx.beginPath();
    ctx.moveTo(centerX + dx * 34, centerY + dy * 21);
    ctx.lineTo(centerX + dx * length, centerY + dy * length * 0.75);
    ctx.stroke();
  }

  for (let ring = 0; ring < 4; ring += 1) {
    const distance = 75 + ring * 48 + wrap(scene.race.z * 0.085, 36);
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, distance * 1.5, distance * 0.81, 0, Math.PI * 0.05, Math.PI * 0.95);
    ctx.strokeStyle = 'rgba(251, 146, 60, ' + (0.10 + ring * 0.02) + ')';
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * @param {Scene} scene
 */
export function drawBackdrop(scene) {
  switch (scene.look.skyline) {
    case 'city': sunset(scene); break;
    case 'mesas': canyon(scene); break;
    case 'clouds': clouds(scene); break;
    case 'planet': orbit(scene); break;
    case 'core': tunnel(scene); break;
    default: break;
  }
}
