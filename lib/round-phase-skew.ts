/** Phase skew is rounded to 1/this mm (10 nm), to suppress floating-point noise. */
const PHASE_SKEW_ROUNDING = 1e5

/** Rounds a phase skew in mm to 1/{@link PHASE_SKEW_ROUNDING} mm, reporting -0 as 0. */
export function roundPhaseSkew(phaseSkew: number): number {
  const rounded =
    Math.round(phaseSkew * PHASE_SKEW_ROUNDING) / PHASE_SKEW_ROUNDING
  if (rounded === 0) return 0
  return rounded
}
