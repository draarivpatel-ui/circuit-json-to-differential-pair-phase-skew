import {
  type CircuitJsonUtilObjects,
  cju,
  createBoardOwnerMap,
} from "@tscircuit/circuit-json-util"
import type {
  AnyCircuitElement,
  PcbBoard,
  PcbPort,
  PcbStackup,
  PcbTrace,
  SourceBus,
} from "circuit-json"
import type {
  DifferentialPairPhaseSkew,
  PhaseSkewTrace,
} from "./differential-pair-phase-skew"
import { findCoupledRuns } from "./find-coupled-runs"
import { type PhaseSkewTrack, getPhaseSkewTrack } from "./get-phase-skew-track"
import { haveOppositeTraceWalkDirections } from "./have-opposite-trace-walk-directions"
import { roundPhaseSkew } from "./round-phase-skew"
import { samplePhaseSkew } from "./sample-phase-skew"
import { type TraceWalk, reverseWalk, walkTrace } from "./walk-trace"

/** Board thickness in mm assumed for a pair that is routed without a board. */
const STANDARD_BOARD_THICKNESS = 1.6

/** The positive and negative walks of a pair, each oriented from its source end. */
type PairWalks = { positive: TraceWalk; negative: TraceWalk }

/**
 * Computes phase skew along every routed differential pair: at each point,
 * how much farther one trace has run than the other, not only at the ends.
 *
 * A pair is measured when each side is routed as exactly one `pcb_trace`;
 * a side routed as several doesn't record their order along the signal.
 *
 * Distances are copper length: planar length plus each layer change's
 * Z-distance through the board's stackup. Each trace with exactly one end
 * port marked `is_output` is walked from that end; if only one trace has
 * such a port, the other is oriented to match it by end distance; if neither
 * does, distances are measured from the positive trace's first route point
 * and the negative trace is walked from the end that matches it.
 */
export function getDifferentialPairPhaseSkew({
  circuitJson,
}: {
  circuitJson: AnyCircuitElement[]
}): DifferentialPairPhaseSkew[] {
  const db = cju(circuitJson)
  const boardOwnerMap = createBoardOwnerMap(circuitJson)
  const pairs: DifferentialPairPhaseSkew[] = []
  for (const bus of db.source_bus.list()) {
    const differentialPair = bus.differential_pair
    if (differentialPair === undefined) continue
    const { positive_source_trace_id, negative_source_trace_id } =
      differentialPair
    if (positive_source_trace_id === negative_source_trace_id) continue
    const positiveTraces = db.pcb_trace.list({
      source_trace_id: positive_source_trace_id,
    })
    const negativeTraces = db.pcb_trace.list({
      source_trace_id: negative_source_trace_id,
    })
    if (positiveTraces.length !== 1 || negativeTraces.length !== 1) continue
    const pairWalks = walkPair({
      positiveTrace: positiveTraces[0],
      negativeTrace: negativeTraces[0],
      db,
      board: boardOwnerMap.get(positiveTraces[0].pcb_trace_id),
    })
    if (pairWalks === null) continue
    pairs.push(
      getPairPhaseSkew({
        bus,
        trace_gap: differentialPair.trace_gap,
        positiveTrace: positiveTraces[0],
        negativeTrace: negativeTraces[0],
        pairWalks,
      }),
    )
  }
  return pairs
}

/** Phase skew for one differential pair routed as one pcb_trace per side. */
function getPairPhaseSkew({
  bus,
  trace_gap,
  positiveTrace,
  negativeTrace,
  pairWalks,
}: {
  bus: SourceBus
  /** The pair's declared edge-to-edge gap in mm, if any. */
  trace_gap: number | undefined
  positiveTrace: PcbTrace
  negativeTrace: PcbTrace
  pairWalks: PairWalks
}): DifferentialPairPhaseSkew {
  const { positive, negative } = pairWalks
  const runs = findCoupledRuns({
    positive: positive.steps,
    negative: negative.steps,
    referenceGapMm: trace_gap,
  })
  const positiveTrack = getPhaseSkewTrack({
    runs,
    side: "positive",
    steps: positive.steps,
    partnerSteps: negative.steps,
    length: positive.length,
  })
  const negativeTrack = getPhaseSkewTrack({
    runs,
    side: "negative",
    steps: negative.steps,
    partnerSteps: positive.steps,
    length: negative.length,
  })

  const pair: DifferentialPairPhaseSkew = {
    source_bus_id: bus.source_bus_id,
    positive_trace: getPhaseSkewTrace({
      trace: positiveTrace,
      walk: positive,
      track: positiveTrack,
    }),
    negative_trace: getPhaseSkewTrace({
      trace: negativeTrace,
      walk: negative,
      track: negativeTrack,
    }),
    end_to_end_length_delta: roundPhaseSkew(positive.length - negative.length),
  }
  if (bus.max_length_skew !== undefined) {
    pair.max_length_skew = bus.max_length_skew
  }
  if (runs.length > 0) {
    pair.max_abs_phase_skew = Math.max(
      positiveTrack.range.maxPhaseSkewMm,
      -positiveTrack.range.minPhaseSkewMm,
      negativeTrack.range.maxPhaseSkewMm,
      -negativeTrack.range.minPhaseSkewMm,
    )
  }
  return pair
}

/**
 * Walks both traces of a pair through their board's stackup, or its
 * thickness without one, and orients each walk from its source end. Null
 * when either trace can't be walked, so the pair is skipped.
 */
function walkPair({
  positiveTrace,
  negativeTrace,
  db,
  board,
}: {
  positiveTrace: PcbTrace
  negativeTrace: PcbTrace
  db: CircuitJsonUtilObjects
  board: PcbBoard | undefined
}): PairWalks | null {
  let pcbStackup: PcbStackup | null = null
  let boardThickness = STANDARD_BOARD_THICKNESS
  if (board !== undefined) {
    pcbStackup = db.pcb_stackup.getWhere({ pcb_board_id: board.pcb_board_id })
    boardThickness = board.thickness
  }
  const positiveWalk = walkTrace({
    trace: positiveTrace,
    pcbStackup,
    boardThickness,
  })
  const negativeWalk = walkTrace({
    trace: negativeTrace,
    pcbStackup,
    boardThickness,
  })
  if (positiveWalk === null || negativeWalk === null) return null
  let positive = positiveWalk
  let negative = negativeWalk
  const positiveOutput = outputEnd({ trace: positiveTrace, db })
  const negativeOutput = outputEnd({ trace: negativeTrace, db })
  if (positiveOutput === "end") positive = reverseWalk(positive)
  if (negativeOutput === "end") negative = reverseWalk(negative)
  if (positiveOutput !== null && negativeOutput !== null) {
    return { positive, negative }
  }
  if (
    !haveOppositeTraceWalkDirections({
      positiveSteps: positive.steps,
      negativeSteps: negative.steps,
    })
  ) {
    return { positive, negative }
  }
  if (negativeOutput !== null) {
    return { positive: reverseWalk(positive), negative }
  }
  return { positive, negative: reverseWalk(negative) }
}

/** One trace's segments and phase skew range, as drawn. */
function getPhaseSkewTrace({
  trace,
  walk,
  track,
}: {
  trace: PcbTrace
  walk: TraceWalk
  track: PhaseSkewTrack
}): PhaseSkewTrace {
  return {
    pcb_trace_id: trace.pcb_trace_id,
    max_phase_skew: track.range.maxPhaseSkewMm,
    min_phase_skew: track.range.minPhaseSkewMm,
    segments: samplePhaseSkew({ steps: walk.steps, spans: track.spans }),
  }
}

/**
 * Which end of `trace` is connected to an output port (`source_port.is_output`),
 * or null unless exactly one end port is an output.
 */
function outputEnd({
  trace,
  db,
}: {
  trace: PcbTrace
  db: CircuitJsonUtilObjects
}): "start" | "end" | null {
  let startPcbPortId: PcbPort["pcb_port_id"] | undefined
  let endPcbPortId: PcbPort["pcb_port_id"] | undefined
  for (const point of trace.route) {
    if (point.route_type !== "wire") continue
    if (startPcbPortId === undefined) startPcbPortId = point.start_pcb_port_id
    if (point.end_pcb_port_id !== undefined) {
      endPcbPortId = point.end_pcb_port_id
    }
  }
  const startIsOutput = isOutputPort({ db, pcbPortId: startPcbPortId })
  const endIsOutput = isOutputPort({ db, pcbPortId: endPcbPortId })
  if (startIsOutput === endIsOutput) return null
  if (startIsOutput) return "start"
  return "end"
}

/** True when a PCB port's source port is marked `is_output`. */
function isOutputPort({
  db,
  pcbPortId,
}: {
  db: CircuitJsonUtilObjects
  pcbPortId: PcbPort["pcb_port_id"] | undefined
}): boolean {
  if (pcbPortId === undefined) return false
  const pcbPort = db.pcb_port.get(pcbPortId)
  if (pcbPort === null) return false
  return db.source_port.get(pcbPort.source_port_id)?.is_output === true
}
