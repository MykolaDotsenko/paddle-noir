// What a recorded picture was painted in: the colors of its fills and strokes, a gradient's
// stops included, and whether they are a paint's own shades and sheens.

const DARK = [5, 6, 15];
const PALE = [226, 232, 240];

/** The colors a brush paints, its gradient's stops if it is one. */
export const brushColors = (brush) => (typeof brush === 'string' ? [brush] : brush.stops.map(([, color]) => color));

/** The calls that put paint on the canvas. */
export const painted = (ctx) => ctx.calls.filter(({ name }) => ['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText'].includes(name));

/** Every color a picture was painted in, the stops of its gradients included, as [r, g, b]. */
export function colorsOf(ctx) {
  const brushes = painted(ctx).map(({ name, brush }) => (name === 'stroke' ? brush.strokeStyle : brush.fillStyle));

  return brushes.flatMap(brushColors).map((color) => (color.startsWith('#')
    ? [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16))
    : color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number)));
}

/** How many fills paint a color starting so, in a plain color or a gradient's stops. */
export const filledIn = (ctx, start) => painted(ctx).filter(({ name, brush }) => name !== 'stroke' && brushColors(brush.fillStyle).some((color) => color.startsWith(start))).length;

/** Whether a color lies between two others. */
function between(color, from, to) {
  let share = null;

  for (const [channel, value] of color.entries()) {
    const span = to[channel] - from[channel];

    if (Math.abs(span) < 4) {
      if (Math.abs(value - from[channel]) > 2) return false;
      continue;
    }

    const at = (value - from[channel]) / span;
    if (at < -0.03 || at > 1.03 || (share !== null && Math.abs(at - share) > 0.04)) return false;
    share ??= at;
  }

  return true;
}

/** How many colors of a picture are a paint, or a shade or a sheen of it. */
export function tinted(ctx, rgb) {
  const paint = rgb.split(',').map(Number);
  return colorsOf(ctx).filter((color) => between(color, paint, DARK) || between(color, paint, PALE)).length;
}
