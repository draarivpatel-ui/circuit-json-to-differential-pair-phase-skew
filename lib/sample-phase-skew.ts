import type { Point } from "circuit-json"
import type { PhaseSkewSegment } from "./differential-pair-phase-skew"
import type { PhaseSkewSpan } from "./get-phase-skew-track"
import { roundPhaseSkew } from "./round-phase-skew"
import { MIN_OVERLAP } from "./select-coupled-runs"
import type { TraceStep } from "./walk-trace"

/** Target spacing of phase skew samples along a ramp, in mm; a ramp with little change in phase skew may be cut more coarsely. */
const RAMP_SAMPLE_SPACING_TARGET_MM = 0.05

/** Ramps are not cut finer than this change in phase skew, in mm (1 µm, the readout precision). */
const RAMP_PHASE_SKEW_INCREMENT_MM = 0.001

/**
 * Cuts the steps at span boundaries. Constant pieces stay whole; pieces
 * where phase skew changes are cut every {@link RAMP_SAMPLE_SPACING_TARGET_MM} mm, or every
 * {@link RAMP_PHASE_SKEW_INCREMENT_MM} mm of phase skew if that is coarser, each with the
 * phase skew at its middle.
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
  const pieceCount = rampPieceCount({ span, from, to })
  for (let piece = 0; piece < pieceCount; piece++) {
    const pieceFrom = from + ((to - from) * piece) / pieceCount
    const pieceTo = from + ((to - from) * (piece + 1)) / pieceCount
    const segment: PhaseSkewSegment = {
      start: pointAt({ step, distance: pieceFrom }),
      end: pointAt({ step, distance: pieceTo }),
      layer: step.layer,
      width: step.width,
    }
    const phaseSkew = phaseSkewAt({ span, distance: (pieceFrom + pieceTo) / 2 })
    if (phaseSkew !== null) segment.phase_skew = phaseSkew
    segments.push(segment)
  }
  return segments
}

/** How many pieces to cut a ramp between `from` and `to` into; 1 when phase skew barely changes. */
function rampPieceCount({
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
  const sampleCountByLength = Math.ceil(
    (to - from) / RAMP_SAMPLE_SPACING_TARGET_MM,
  )
  const sampleCountByPhaseSkew = Math.ceil(
    Math.abs(endPhaseSkewMm - startPhaseSkewMm) / RAMP_PHASE_SKEW_INCREMENT_MM,
  )
  return Math.max(1, Math.min(sampleCountByLength, sampleCountByPhaseSkew))
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
