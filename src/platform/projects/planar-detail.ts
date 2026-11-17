// Mask detail is measured in source-image pixels (the canonical frame is the main
// raster at native resolution), never in screen pixels or physical units (#122).
// Marks that record a tolerance tessellate their brush caps so the polygon stays
// within that many source pixels of the true circle. Marks saved before #122 carry
// no tolerance and keep their original 16-sided caps, so stored geometry reproduces.

/** Default boundary tolerance for new marks, in source pixels. */
export const sourceTolerance = 0.25;
/** Bounds accepted on a stored mark tolerance, in source pixels. */
export const toleranceRange = [1 / 64, 16] as const;
/** Legacy cap and the floor for every cap: brushes up to about 26 source px wide. */
export const minCapSides = 16;
/**
 * Ceiling per cap. One cap is then at most 1/64 of the 4096-edge mask budget. A
 * 64-gon stays within 0.25 source px of the circle up to a 414 px wide brush; wider
 * brushes deviate by at most 0.12 % of their radius.
 */
export const maxCapSides = 64;

export function validTolerance(value: unknown) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= toleranceRange[0] &&
    value <= toleranceRange[1]
  );
}

/** Sides of a regular polygon whose sagitta stays within tolerance of a circle. */
export function capSides(radius: number, tolerance?: number) {
  if (tolerance === undefined || !(radius > tolerance)) return minCapSides;
  const exact = Math.PI / Math.acos(1 - tolerance / radius);
  const sides = Math.ceil(exact / 4) * 4;
  return Math.min(maxCapSides, Math.max(minCapSides, sides));
}

/** Largest cap side count, a multiple of 4, that keeps a stroke's caps inside the budget. */
export function budgetSides(sides: number, caps: number, budget: number) {
  return Math.max(minCapSides, Math.min(sides, Math.floor(budget / caps / 4) * 4));
}
