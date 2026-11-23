import type { Point } from "circuit-json"
import type { PhaseSkewSegment } from "./differential-pair-phase-skew"
import type { PhaseSkewSpan } from "./get-phase-skew-track"
import { roundPhaseSkew } from "./round-phase-skew"
import { MIN_OVERLAP } from "./select-coupled-runs"
import type { TraceStep } from "./walk-trace"

/** Target spacing of phase skew samples along a ramp, in mm. */
const RAMP_SAMPLE_SPACING_TARGET_MM = 0.05

/**
 * Cuts the steps at span boundaries. Constant pieces stay whole; pieces
 * where phase skew changes are cut every
 * {@link RAMP_SAMPLE_SPACING_TARGET_MM} mm, each with the rounded phase skew
 * at its middle, and neighbouring pieces whose rounded phase skew is equal
 * are joined. A ramp so keeps its gradient down to the 10 nm rounding
 * without a piece for every sample.
 */
export function samplePhaseSkew({
  steps,
  spans,
}: {
  steps: TraceStep[]
  spans: PhaseSkewSpan[]
}): PhaseSkewSegment[] {
  const segments: PhaseSkewSegment[] = []
  let spanIndex = 0
  for (const step of steps) {
    const stepEnd = step.startDistance + step.length
    while (
      spanIndex + 1 < spans.length &&
      spans[spanIndex].endWalkDistanceMm <= step.startDistance
    ) {
      spanIndex++
    }
    for (
      let index = spanIndex;
      index < spans.length && spans[index].startWalkDistanceMm < stepEnd;
      index++
    ) {
      const span = spans[index]
      const from = Math.max(step.startDistance, span.startWalkDistanceMm)
      const to = Math.min(stepEnd, span.endWalkDistanceMm)
      if (to - from <= MIN_OVERLAP) continue
      for (const segment of sampleSpan({ step, span, from, to })) {
        segments.push(segment)
      }
    }
  }
  return segments
}

/** The pieces of one step between walk distances `from` and `to`, all inside one span. */
function sampleSpan({
  step,
  span,
  from,
  to,
}: {
  step: TraceStep
  span: PhaseSkewSpan
  from: number
  to: number
}): PhaseSkewSegment[] {
  const segments: PhaseSkewSegment[] = []
  const sampleCount = getRampSampleCount({ span, from, to })
  for (let sample = 0; sample < sampleCount; sample++) {
    const pieceFrom = from + ((to - from) * sample) / sampleCount
    const pieceTo = from + ((to - from) * (sample + 1)) / sampleCount
    const phaseSkew = phaseSkewAt({ span, distance: (pieceFrom + pieceTo) / 2 })
    const end = pointAt({ step, distance: pieceTo })
    const previous = segments[segments.length - 1]
    if (previous !== undefined && previous.phase_skew === phaseSkew) {
      segments[segments.length - 1] = { ...previous, end }
      continue
    }
    const segment: PhaseSkewSegment = {
      start: pointAt({ step, distance: pieceFrom }),
      end,
      layer: step.layer,
      width: step.width,
    }
    if (phaseSkew !== null) segment.phase_skew = phaseSkew
    segments.push(segment)
  }
  return segments
}

/** How many samples to cut a ramp between `from` and `to` into; 1 where phase skew is unknown or constant. */
function getRampSampleCount({
  span,
  from,
  to,
}: {
  span: PhaseSkewSpan
  from: number
  to: number
}): number {
  const startPhaseSkewMm = phaseSkewAt({ span, distance: from })
  const endPhaseSkewMm = phaseSkewAt({ span, distance: to })
  if (startPhaseSkewMm === null || endPhaseSkewMm === null) return 1
  if (startPhaseSkewMm === endPhaseSkewMm) return 1
  return Math.ceil((to - from) / RAMP_SAMPLE_SPACING_TARGET_MM)
}

/** The phase skew at a distance inside a span, rounded; null where it is unknown. */
function phaseSkewAt({
  span,
  distance,
}: {
  span: PhaseSkewSpan
  distance: number
}): number | null {
  if (span.startPhaseSkewMm === null) return null
  const spanFraction =
    (distance - span.startWalkDistanceMm) /
    (span.endWalkDistanceMm - span.startWalkDistanceMm)
  return roundPhaseSkew(
    span.startPhaseSkewMm +
      spanFraction * (span.endPhaseSkewMm - span.startPhaseSkewMm),
  )
}

/** The point on a step at a distance along the whole walk. */
function pointAt({
  step,
  distance,
}: {
  step: TraceStep
  distance: number
}): Point {
  const fraction = (distance - step.startDistance) / step.length
  return {
    x: step.start.x + (step.end.x - step.start.x) * fraction,
    y: step.start.y + (step.end.y - step.start.y) * fraction,
  }
}
