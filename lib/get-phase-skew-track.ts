import { roundPhaseSkew } from "./round-phase-skew"
import { type CoupledRun, MIN_OVERLAP } from "./select-coupled-runs"
import type { TraceStep } from "./walk-trace"

/** A stretch of one trace, in mm along its walk, with phase skew changing linearly from `startSkew` to `endSkew`. */
export type KnownPhaseSkewSpan = {
  from: number
  to: number
  startSkew: number
  endSkew: number
}

/** A stretch of one trace, in mm along its walk, where phase skew is unknown. */
export type UnknownPhaseSkewSpan = {
  from: number
  to: number
  startSkew: null
  endSkew: null
}

/** A stretch of one trace with known or unknown phase skew. */
export type PhaseSkewSpan = KnownPhaseSkewSpan | UnknownPhaseSkewSpan

/** The largest and smallest phase skew on one trace, in mm; `max` is zero or more, `min` zero or less. */
export type PhaseSkewRange = { max: number; min: number }

/** One trace's phase skew spans and their range. */
export type PhaseSkewTrack = { spans: PhaseSkewSpan[]; range: PhaseSkewRange }

/** Which trace of the pair a walk belongs to. */
type PairSide = "positive" | "negative"

/**
 * A coupled run seen from one trace: where it starts and ends on this trace
 * (`from`, `to`) and on its partner, the phase skew at each end, and the
 * length of any via right at each end on either trace, all in mm.
 */
type SideRun = {
  from: number
  to: number
  otherFrom: number
  otherTo: number
  startSkew: number
  endSkew: number
  startVia: number
  endVia: number
  otherStartVia: number
  otherEndVia: number
}

/**
 * Covers one whole trace with spans: unknown before the first coupled run
 * and after the last, coupled runs as measured, and interpolated between
 * consecutive runs. When a coupled run begins or ends right at a via, the
 * via length steps at the via instead of ramping across the uncoupled
 * stretch, and the via endpoint is included in the trace's range even
 * before the first run or after the last. The negative side reports the
 * negated phase skew, so each trace shows how far it is ahead of its partner.
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
      spans: [unknownSpan({ from: 0, to: length })],
      range: { max: 0, min: 0 },
    }
  }
  const first = sideRuns[0]
  const last = sideRuns[sideRuns.length - 1]
  const spans: PhaseSkewSpan[] = []
  // Gaps under MIN_OVERLAP are rounding at shared corners, not stretches.
  if (first.from > MIN_OVERLAP) {
    spans.push(unknownSpan({ from: 0, to: first.from }))
  }
  for (let index = 0; index < sideRuns.length; index++) {
    const run = sideRuns[index]
    const previous = sideRuns[index - 1]
    if (previous !== undefined) {
      const gap = gapSpan({ previous, run })
      if (gap !== null) spans.push(gap)
    }
    spans.push({
      from: run.from,
      to: run.to,
      startSkew: run.startSkew,
      endSkew: run.endSkew,
    })
  }
  if (length - last.to > MIN_OVERLAP) {
    spans.push(unknownSpan({ from: last.to, to: length }))
  }
  return {
    spans,
    range: getPhaseSkewRange({
      spans,
      viaSkews: edgeViaSkews({ first, last }),
    }),
  }
}

/** The coupled runs seen from `side`, with via lengths at their ends, in order along that trace. */
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
      const { from, to, otherFrom, otherTo } = runEnds({ run, side })
      return {
        from,
        to,
        otherFrom,
        otherTo,
        startSkew: from - otherFrom,
        endSkew: to - otherTo,
        startVia: viaAt({ steps, distance: from, edge: "start" }),
        endVia: viaAt({ steps, distance: to, edge: "end" }),
        otherStartVia: viaAt({
          steps: partnerSteps,
          distance: otherFrom,
          edge: "start",
        }),
        otherEndVia: viaAt({
          steps: partnerSteps,
          distance: otherTo,
          edge: "end",
        }),
      }
    })
    .sort((a, b) => a.from - b.from)
}

/** Where a coupled run starts and ends on one trace (`from`, `to`) and on its partner, in mm along each walk. */
type RunEnds = { from: number; to: number; otherFrom: number; otherTo: number }

/** A run's ends on `side` and on the partner trace. */
function runEnds({ run, side }: { run: CoupledRun; side: PairSide }): RunEnds {
  if (side === "positive") {
    return {
      from: run.positiveStart,
      to: run.positiveEnd,
      otherFrom: run.negativeStart,
      otherTo: run.negativeEnd,
    }
  }
  return {
    from: run.negativeStart,
    to: run.negativeEnd,
    otherFrom: run.positiveStart,
    otherTo: run.positiveEnd,
  }
}

/**
 * The interpolated span between two consecutive coupled runs, from just
 * after any via ending the first to just before any via starting the second,
 * or null when they touch.
 */
function gapSpan({
  previous,
  run,
}: {
  previous: SideRun
  run: SideRun
}): KnownPhaseSkewSpan | null {
  const gapFrom = previous.to + previous.endVia
  const gapTo = run.from - run.startVia
  if (gapTo - gapFrom <= MIN_OVERLAP) return null
  const afterPrevious =
    previous.endSkew + previous.endVia - previous.otherEndVia
  const partnerHasCopperGap =
    run.otherFrom - (previous.otherTo + previous.otherEndVia) > MIN_OVERLAP
  // If the partner had only a single via between the two runs, that via
  // was already accounted for at `previous.otherEndVia`.
  let otherStartVia = 0
  if (partnerHasCopperGap) otherStartVia = run.otherStartVia
  return {
    from: gapFrom,
    to: gapTo,
    startSkew: afterPrevious,
    endSkew: run.startSkew - run.startVia + otherStartVia,
  }
}

/** Phase skew just across a via before the first coupled run or after the last, which the range includes. */
function edgeViaSkews({
  first,
  last,
}: {
  first: SideRun
  last: SideRun
}): number[] {
  const viaSkews: number[] = []
  if (first.startVia > 0 || first.otherStartVia > 0) {
    viaSkews.push(first.startSkew - first.startVia + first.otherStartVia)
  }
  if (last.endVia > 0 || last.otherEndVia > 0) {
    viaSkews.push(last.endSkew + last.endVia - last.otherEndVia)
  }
  return viaSkews
}

/** The range of the rounded phase skew at every known span end and at `viaSkews`, always including zero. */
function getPhaseSkewRange({
  spans,
  viaSkews,
}: {
  spans: PhaseSkewSpan[]
  viaSkews: number[]
}): PhaseSkewRange {
  const skews = [...viaSkews]
  for (const span of spans) {
    if (span.startSkew === null) continue
    skews.push(span.startSkew, span.endSkew)
  }
  const range: PhaseSkewRange = { max: 0, min: 0 }
  for (const skew of skews) {
    const rounded = roundPhaseSkew(skew)
    if (rounded > range.max) range.max = rounded
    if (rounded < range.min) range.min = rounded
  }
  return range
}

/** Length of any via directly before the start or after the end of a step at `distance`, in mm. */
function viaAt({
  steps,
  distance,
  edge,
}: {
  steps: TraceStep[]
  distance: number
  edge: "start" | "end"
}): number {
  let low = 0
  let high = steps.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (edgeDistance({ step: steps[middle], edge }) < distance - MIN_OVERLAP) {
      low = middle + 1
      continue
    }
    high = middle
  }
  for (
    let index = low;
    index < steps.length &&
    edgeDistance({ step: steps[index], edge }) <= distance + MIN_OVERLAP;
    index++
  ) {
    const length = edgeViaLength({ step: steps[index], edge })
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

/** Length of the via directly before a step's start or after its end, in mm. */
function edgeViaLength({
  step,
  edge,
}: {
  step: TraceStep
  edge: "start" | "end"
}): number {
  if (edge === "start") return step.startViaLength
  return step.endViaLength
}

/** A span with no phase skew information. */
function unknownSpan({
  from,
  to,
}: {
  from: number
  to: number
}): UnknownPhaseSkewSpan {
  return { from, to, startSkew: null, endSkew: null }
}
