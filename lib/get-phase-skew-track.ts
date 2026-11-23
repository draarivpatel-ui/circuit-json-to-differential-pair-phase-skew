import { roundPhaseSkew } from "./round-phase-skew"
import { type CoupledRun, MIN_OVERLAP } from "./select-coupled-runs"
import type { TraceStep } from "./walk-trace"

/**
 * A stretch of one trace, between two routed distances along its walk, with
 * phase skew changing linearly from `startPhaseSkewMm` to `endPhaseSkewMm`.
 */
export type KnownPhaseSkewSpan = {
  startWalkDistanceMm: number
  endWalkDistanceMm: number
  startPhaseSkewMm: number
  endPhaseSkewMm: number
}

/** A stretch of one trace, between two routed distances along its walk, where phase skew is unknown. */
export type UnknownPhaseSkewSpan = {
  startWalkDistanceMm: number
  endWalkDistanceMm: number
  startPhaseSkewMm: null
  endPhaseSkewMm: null
}

/** A stretch of one trace with known or unknown phase skew. */
export type PhaseSkewSpan = KnownPhaseSkewSpan | UnknownPhaseSkewSpan

/**
 * The maximum and minimum phase skew on one trace, in mm, including zero,
 * evaluated at known span endpoints and adjacent via edges.
 */
export type PhaseSkewRange = { maxPhaseSkewMm: number; minPhaseSkewMm: number }

/** One trace's phase skew spans and their range. */
export type PhaseSkewTrack = { spans: PhaseSkewSpan[]; range: PhaseSkewRange }

/** Which trace of the pair a walk belongs to. */
type PairSide = "positive" | "negative"

/**
 * A coupled run seen from one trace: where it starts and ends on this trace
 * and on its partner, the phase skew at each end, and the length of any
 * layer change right at each end on either trace, all in mm.
 */
type SideRun = {
  startWalkDistanceMm: number
  endWalkDistanceMm: number
  partnerStartWalkDistanceMm: number
  partnerEndWalkDistanceMm: number
  startPhaseSkewMm: number
  endPhaseSkewMm: number
  layerChangeLengthBeforeMm: number
  layerChangeLengthAfterMm: number
  partnerLayerChangeLengthBeforeMm: number
  partnerLayerChangeLengthAfterMm: number
}

/**
 * Covers one whole trace with spans: unknown before the first coupled run
 * and after the last, coupled runs as measured, and interpolated between
 * consecutive runs. When a coupled run begins or ends right at a via, the
 * via length steps at the via instead of ramping across the uncoupled
 * stretch, and the via endpoint is included in the trace's range even
 * before the first run or after the last. Each trace reports its own routed
 * distance minus its partner's, as KiCad does, so the negative trace shows
 * negative minus positive.
 */
export function getPhaseSkewTrack({
  runs,
  side,
  steps,
  partnerSteps,
  length,
}: {
  runs: CoupledRun[]
  side: PairSide
  steps: TraceStep[]
  partnerSteps: TraceStep[]
  /** The trace's walk length, in mm. */
  length: number
}): PhaseSkewTrack {
  const sideRuns = getSideRuns({ runs, side, steps, partnerSteps })
  if (sideRuns.length === 0) {
    return {
      spans: [
        unknownSpan({ startWalkDistanceMm: 0, endWalkDistanceMm: length }),
      ],
      range: { maxPhaseSkewMm: 0, minPhaseSkewMm: 0 },
    }
  }
  const first = sideRuns[0]
  const last = sideRuns[sideRuns.length - 1]
  const spans: PhaseSkewSpan[] = []
  // Gaps under MIN_OVERLAP are rounding at shared corners, not stretches.
  if (first.startWalkDistanceMm > MIN_OVERLAP) {
    spans.push(
      unknownSpan({
        startWalkDistanceMm: 0,
        endWalkDistanceMm: first.startWalkDistanceMm,
      }),
    )
  }
  for (let index = 0; index < sideRuns.length; index++) {
    const run = sideRuns[index]
    const previous = sideRuns[index - 1]
    if (previous !== undefined) {
      const unmatchedSpan = interpolateUnmatchedSpan({ previous, run })
      if (unmatchedSpan !== null) spans.push(unmatchedSpan)
    }
    spans.push({
      startWalkDistanceMm: run.startWalkDistanceMm,
      endWalkDistanceMm: run.endWalkDistanceMm,
      startPhaseSkewMm: run.startPhaseSkewMm,
      endPhaseSkewMm: run.endPhaseSkewMm,
    })
  }
  if (length - last.endWalkDistanceMm > MIN_OVERLAP) {
    spans.push(
      unknownSpan({
        startWalkDistanceMm: last.endWalkDistanceMm,
        endWalkDistanceMm: length,
      }),
    )
  }
  return {
    spans,
    range: getPhaseSkewRange({
      spans,
      outerViaEdgePhaseSkewsMm: getOuterViaEdgePhaseSkewsMm({ first, last }),
    }),
  }
}

/** The coupled runs seen from `side`, with layer change lengths at their ends, in order along that trace. */
function getSideRuns({
  runs,
  side,
  steps,
  partnerSteps,
}: {
  runs: CoupledRun[]
  side: PairSide
  steps: TraceStep[]
  partnerSteps: TraceStep[]
}): SideRun[] {
  return runs
    .map((run) => {
      const {
        startWalkDistanceMm,
        endWalkDistanceMm,
        partnerStartWalkDistanceMm,
        partnerEndWalkDistanceMm,
      } = runEnds({ run, side })
      return {
        startWalkDistanceMm,
        endWalkDistanceMm,
        partnerStartWalkDistanceMm,
        partnerEndWalkDistanceMm,
        startPhaseSkewMm: startWalkDistanceMm - partnerStartWalkDistanceMm,
        endPhaseSkewMm: endWalkDistanceMm - partnerEndWalkDistanceMm,
        layerChangeLengthBeforeMm: getAdjacentLayerChangeLengthMm({
          steps,
          walkDistanceMm: startWalkDistanceMm,
          edge: "start",
        }),
        layerChangeLengthAfterMm: getAdjacentLayerChangeLengthMm({
          steps,
          walkDistanceMm: endWalkDistanceMm,
          edge: "end",
        }),
        partnerLayerChangeLengthBeforeMm: getAdjacentLayerChangeLengthMm({
          steps: partnerSteps,
          walkDistanceMm: partnerStartWalkDistanceMm,
          edge: "start",
        }),
        partnerLayerChangeLengthAfterMm: getAdjacentLayerChangeLengthMm({
          steps: partnerSteps,
          walkDistanceMm: partnerEndWalkDistanceMm,
          edge: "end",
        }),
      }
    })
    .sort((a, b) => a.startWalkDistanceMm - b.startWalkDistanceMm)
}

/** Where a coupled run starts and ends on one trace and on its partner, in mm along each walk. */
type RunEnds = {
  startWalkDistanceMm: number
  endWalkDistanceMm: number
  partnerStartWalkDistanceMm: number
  partnerEndWalkDistanceMm: number
}

/** A run's ends on `side` and on the partner trace. */
function runEnds({ run, side }: { run: CoupledRun; side: PairSide }): RunEnds {
  if (side === "positive") {
    return {
      startWalkDistanceMm: run.positiveStartDistanceMm,
      endWalkDistanceMm: run.positiveEndDistanceMm,
      partnerStartWalkDistanceMm: run.negativeStartDistanceMm,
      partnerEndWalkDistanceMm: run.negativeEndDistanceMm,
    }
  }
  return {
    startWalkDistanceMm: run.negativeStartDistanceMm,
    endWalkDistanceMm: run.negativeEndDistanceMm,
    partnerStartWalkDistanceMm: run.positiveStartDistanceMm,
    partnerEndWalkDistanceMm: run.positiveEndDistanceMm,
  }
}

/**
 * The interpolated span between two consecutive coupled runs, from just
 * after any via ending the first to just before any via starting the second,
 * or null when they touch.
 */
function interpolateUnmatchedSpan({
  previous,
  run,
}: {
  previous: SideRun
  run: SideRun
}): KnownPhaseSkewSpan | null {
  const startWalkDistanceMm =
    previous.endWalkDistanceMm + previous.layerChangeLengthAfterMm
  const endWalkDistanceMm =
    run.startWalkDistanceMm - run.layerChangeLengthBeforeMm
  if (endWalkDistanceMm - startWalkDistanceMm <= MIN_OVERLAP) return null
  const phaseSkewAfterPreviousRunMm =
    previous.endPhaseSkewMm +
    previous.layerChangeLengthAfterMm -
    previous.partnerLayerChangeLengthAfterMm
  const partnerHasCopperGap =
    run.partnerStartWalkDistanceMm -
      (previous.partnerEndWalkDistanceMm +
        previous.partnerLayerChangeLengthAfterMm) >
    MIN_OVERLAP
  // If the partner had only a single via between the two runs, that via
  // was already accounted for at `previous.partnerLayerChangeLengthAfterMm`.
  let partnerLayerChangeLengthBeforeMm = 0
  if (partnerHasCopperGap) {
    partnerLayerChangeLengthBeforeMm = run.partnerLayerChangeLengthBeforeMm
  }
  return {
    startWalkDistanceMm,
    endWalkDistanceMm,
    startPhaseSkewMm: phaseSkewAfterPreviousRunMm,
    endPhaseSkewMm:
      run.startPhaseSkewMm -
      run.layerChangeLengthBeforeMm +
      partnerLayerChangeLengthBeforeMm,
  }
}

/** Phase skew just across a via before the first coupled run or after the last, which the range includes. */
function getOuterViaEdgePhaseSkewsMm({
  first,
  last,
}: {
  first: SideRun
  last: SideRun
}): number[] {
  const outerViaEdgePhaseSkewsMm: number[] = []
  if (
    first.layerChangeLengthBeforeMm > 0 ||
    first.partnerLayerChangeLengthBeforeMm > 0
  ) {
    outerViaEdgePhaseSkewsMm.push(
      first.startPhaseSkewMm -
        first.layerChangeLengthBeforeMm +
        first.partnerLayerChangeLengthBeforeMm,
    )
  }
  if (
    last.layerChangeLengthAfterMm > 0 ||
    last.partnerLayerChangeLengthAfterMm > 0
  ) {
    outerViaEdgePhaseSkewsMm.push(
      last.endPhaseSkewMm +
        last.layerChangeLengthAfterMm -
        last.partnerLayerChangeLengthAfterMm,
    )
  }
  return outerViaEdgePhaseSkewsMm
}

/**
 * The maximum and minimum rounded phase skew, including zero, evaluated at
 * every known span endpoint and at `outerViaEdgePhaseSkewsMm`.
 */
function getPhaseSkewRange({
  spans,
  outerViaEdgePhaseSkewsMm,
}: {
  spans: PhaseSkewSpan[]
  outerViaEdgePhaseSkewsMm: number[]
}): PhaseSkewRange {
  const phaseSkewsMm = [...outerViaEdgePhaseSkewsMm]
  for (const span of spans) {
    if (span.startPhaseSkewMm === null) continue
    phaseSkewsMm.push(span.startPhaseSkewMm, span.endPhaseSkewMm)
  }
  const range: PhaseSkewRange = { maxPhaseSkewMm: 0, minPhaseSkewMm: 0 }
  for (const phaseSkewMm of phaseSkewsMm) {
    const roundedPhaseSkewMm = roundPhaseSkew(phaseSkewMm)
    if (roundedPhaseSkewMm > range.maxPhaseSkewMm) {
      range.maxPhaseSkewMm = roundedPhaseSkewMm
    }
    if (roundedPhaseSkewMm < range.minPhaseSkewMm) {
      range.minPhaseSkewMm = roundedPhaseSkewMm
    }
  }
  return range
}

/** Z-distance of any layer change directly before the start or after the end of a step at `walkDistanceMm`, in mm. */
function getAdjacentLayerChangeLengthMm({
  steps,
  walkDistanceMm,
  edge,
}: {
  steps: TraceStep[]
  walkDistanceMm: number
  edge: "start" | "end"
}): number {
  let low = 0
  let high = steps.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (
      edgeDistance({ step: steps[middle], edge }) <
      walkDistanceMm - MIN_OVERLAP
    ) {
      low = middle + 1
      continue
    }
    high = middle
  }
  for (
    let index = low;
    index < steps.length &&
    edgeDistance({ step: steps[index], edge }) <= walkDistanceMm + MIN_OVERLAP;
    index++
  ) {
    const length = edgeLayerChangeLengthMm({ step: steps[index], edge })
    if (length > 0) return length
  }
  return 0
}

/** Distance along the walk to a step's start or end, in mm. */
function edgeDistance({
  step,
  edge,
}: {
  step: TraceStep
  edge: "start" | "end"
}): number {
  if (edge === "start") return step.startDistance
  return step.startDistance + step.length
}

/** Z-distance of the layer changes directly before a step's start or after its end, in mm. */
function edgeLayerChangeLengthMm({
  step,
  edge,
}: {
  step: TraceStep
  edge: "start" | "end"
}): number {
  if (edge === "start") return step.layerChangeLengthBeforeMm
  return step.layerChangeLengthAfterMm
}

/** A span with no phase skew information. */
function unknownSpan({
  startWalkDistanceMm,
  endWalkDistanceMm,
}: {
  startWalkDistanceMm: number
  endWalkDistanceMm: number
}): UnknownPhaseSkewSpan {
  return {
    startWalkDistanceMm,
    endWalkDistanceMm,
    startPhaseSkewMm: null,
    endPhaseSkewMm: null,
  }
}
