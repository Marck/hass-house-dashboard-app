const COS30 = Math.cos(Math.PI / 6);

/**
 * Isometric projection. Returns a function that maps grid coordinates
 * (x to the lower right, y to the lower left, z up) to screen [x, y].
 */
export function iso(unit, originX, originY) {
  return (x, y, z = 0) => [originX + (x - y) * unit * COS30, originY + (x + y) * unit * 0.5 - z * unit];
}

/** Screen radii of a circle lying flat on the ground. */
export const groundEllipse = (radius, unit) => [radius * unit * COS30 * Math.SQRT2, radius * unit * 0.5 * Math.SQRT2];

export const percent = (value, total) => `${((value / total) * 100).toFixed(2)}%`;
