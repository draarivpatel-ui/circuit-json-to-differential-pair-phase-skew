import type { LayerRef, PcbTrace, Point, SourceBus } from "circuit-json"

/**
 * Phase skew of one differential pair, ready to draw.
 *
 * Phase skew is how much farther one trace has run than its partner at each
 * point where the two run together, as KiCad's differential pair phase skew
 * tool shows it. Lengths are routed copper length in mm, counting each via
 * by its height through the board's stackup.
 */
export type DifferentialPairPhaseSkew = {
  source_bus_id: SourceBus["source_bus_id"]
  /** The pair's positive trace. */
  positive_trace: PhaseSkewTrace
  /** The pair's negative trace. */
  negative_trace: PhaseSkewTrace
  /** Largest phase skew magnitude over the pair, in mm. Absent when every piece is unknown. */
  max_abs_phase_skew?: number
  /** Routed length of the positive trace minus the negative trace, end to end, in mm. */
  end_to_end_length_delta?: number
  /** The `maxLengthSkew` limit set on the `<differentialpair>`, in mm. */
  max_length_skew?: SourceBus["max_length_skew"]
}

/** One trace of the pair, cut into coloured pieces. */
export type PhaseSkewTrace = {
  pcb_trace_id: PcbTrace["pcb_trace_id"]
  /** Largest known phase skew on this trace, zero or more mm: the colour scale for positive values. */
  max_phase_skew: number
  /** Smallest known phase skew on this trace, zero or less mm: the colour scale for negative values. */
  min_phase_skew: number
  segments: PhaseSkewSegment[]
}

/** One drawn piece: a straight line of copper in PCB coordinates, in mm. */
export type PhaseSkewSegment = {
  start: Point
  end: Point
  layer: LayerRef
  /** Copper width, in mm. */
  width: number
  /**
   * How much farther this trace has run than its partner at the middle of
   * the piece, in mm: positive where this trace is longer, negative where
   * it is shorter. Absent where it is unknown, before the traces first run
   * together and after they last do.
   */
  phase_skew?: number
}
