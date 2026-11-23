import type { Point } from "circuit-json"
import type { TraceStep } from "./walk-trace"

/**
 * True when the two walks run in opposite directions: each walk's ends lie
 * closer to the other walk's ends when one of them is reversed. Route ends
 * are the pair's pads, so this holds even when one part owns pads at both
 * ends of the pair.
 */
export function haveOppositeTraceWalkDirections({
  positiveSteps,
  negativeSteps,
}: {
  positiveSteps: TraceStep[]
  negativeSteps: TraceStep[]
}): boolean {
  const positiveStart = positiveSteps[0].start
  const positiveEnd = positiveSteps[positiveSteps.length - 1].end
  const negativeStart = negativeSteps[0].start
  const negativeEnd = negativeSteps[negativeSteps.length - 1].end
  const sameDirectionEndpointDistanceMm =
    distance({ a: positiveStart, b: negativeStart }) +
    distance({ a: positiveEnd, b: negativeEnd })
  const oppositeDirectionEndpointDistanceMm =
    distance({ a: positiveStart, b: negativeEnd }) +
    distance({ a: positiveEnd, b: negativeStart })
  return oppositeDirectionEndpointDistanceMm < sameDirectionEndpointDistanceMm
}

/** Straight-line distance between two points, in mm. */
function distance({ a, b }: { a: Point; b: Point }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
