// Public types shared with index.ts. tsup reads this declaration when
// TypeScript skips declaration emit for the source installed in node_modules.
import type {
  AnyCircuitElement,
  LayerRef,
  PcbTrace,
  Point,
  SourceBus,
} from "circuit-json"

/**
 * Phase skew of one differential pair, ready to draw.
 *
 * Phase skew is how much farther one trace has run than its partner at each
 * point where the two run together, as KiCad's differential pair phase skew
 * tool shows it. Lengths are routed copper length in mm, counting each via
 * by its height through the board's stackup.
 *
 * Phase skew is signed per trace, as in KiCad: each trace reports its own
 * routed distance minus its partner's, so `positive_trace` reports positive
 * minus negative and `negative_trace` negative minus positive, and the two
 * traces show opposite signs at the same place.
 */
export type DifferentialPairPhaseSkew = {
  source_bus_id: SourceBus["source_bus_id"]
  /** The pair's positive trace. */
  positive_trace: PhaseSkewTrace
  /** The pair's negative trace. */
  negative_trace: PhaseSkewTrace
  /** Largest phase skew magnitude over the pair, in mm. Absent when phase skew is unknown everywhere. */
  max_abs_phase_skew?: number
  /** Routed length of the positive trace minus the negative trace, end to end, in mm. */
  end_to_end_length_delta: number
  /** The unsigned `maxLengthSkew` limit set on the `<differentialpair>`, in mm. */
  max_length_skew?: SourceBus["max_length_skew"]
}

/** One trace of the pair, cut into coloured pieces. */
export type PhaseSkewTrace = {
  pcb_trace_id: PcbTrace["pcb_trace_id"]
  /**
   * Maximum phase skew on this trace, including zero, evaluated at known
   * span endpoints and adjacent via edges, in mm: the colour scale for
   * positive values.
   */
  max_phase_skew: number
  /**
   * Minimum phase skew on this trace, including zero, evaluated at known
   * span endpoints and adjacent via edges, in mm: the colour scale for
   * negative values.
   */
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
   * the piece, in mm: this trace's routed distance minus its partner's, so
   * positive where this trace is ahead and negative where it is behind.
   * Absent where phase skew is unknown: before the traces first run
   * together and after they last do.
   */
  phase_skew?: number
}

/**
 * CSS colours for drawing phase skew: by sign, at zero, and where it is
 * unknown. The sign is per trace, as KiCad shows it: positive where this
 * trace has run farther than its partner, so the two traces of a pair show
 * opposite colours at the same place.
 */
export type PhaseSkewColors = {
  /** Where this trace has run farther than its partner. */
  positive: string
  /** Where this trace has run less far than its partner. */
  negative: string
  /** Where the two traces are in step. */
  zero: string
  /** Where phase skew is unknown. */
  unknown: string
}

/** One opaque overlay stroke, in PCB coordinates and width in mm. */
export type PhaseSkewStroke = {
  layer: LayerRef
  start: Point
  end: Point
  width: number
  color: string
}

export declare const DEFAULT_PHASE_SKEW_COLORS: PhaseSkewColors

export declare function getDifferentialPairPhaseSkew({
  circuitJson,
}: {
  circuitJson: AnyCircuitElement[]
}): DifferentialPairPhaseSkew[]

export declare function getDifferentialPairPhaseSkewStrokes(
  circuitJson: AnyCircuitElement[],
  options?: { colors?: Partial<PhaseSkewColors> },
): PhaseSkewStroke[]
