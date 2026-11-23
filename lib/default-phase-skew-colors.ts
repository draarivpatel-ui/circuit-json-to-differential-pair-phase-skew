/** CSS colours for drawing phase skew: by sign, at zero, and where it is unknown. */
export type PhaseSkewColors = {
  /** Where this trace has run farther than its partner. */
  positive: string
  /** Where this trace has run less far than its partner. */
  negative: string
  /** Where the two traces are in step. */
  zero: string
  /** Where the traces do not run together, so the phase skew is unknown. */
  unknown: string
}

/** KiCad's default phase skew colours: blue, red, white and 50% grey. */
export const DEFAULT_PHASE_SKEW_COLORS: PhaseSkewColors = {
  positive: "rgb(0, 0, 255)",
  negative: "rgb(255, 0, 0)",
  zero: "rgb(255, 255, 255)",
  unknown: "rgb(128, 128, 128)",
}
