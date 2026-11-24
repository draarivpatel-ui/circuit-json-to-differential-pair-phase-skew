import type { PhaseSkewColors } from "./index.d"

/** KiCad's default phase skew colours: blue, red, white and 50% grey. */
export const DEFAULT_PHASE_SKEW_COLORS: PhaseSkewColors = {
  positive: "rgb(0, 0, 255)",
  negative: "rgb(255, 0, 0)",
  zero: "rgb(255, 255, 255)",
  unknown: "rgb(128, 128, 128)",
}
