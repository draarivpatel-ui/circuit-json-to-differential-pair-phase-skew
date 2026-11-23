import type { PhaseSkewSegment } from "lib/index"

/**
 * The horizontal phase skew segment that covers `x`, optionally at height `y`.
 * Throws when there is none, so a test can't pass on a missing segment.
 */
export function segmentAtX<
  Segment extends Pick<PhaseSkewSegment, "start" | "end">,
>({ segments, x, y }: { segments: Segment[]; x: number; y?: number }): Segment {
  const segment = segments.find(
    (candidate) =>
      candidate.start.y === candidate.end.y &&
      (y === undefined || Math.abs(candidate.start.y - y) < 1e-9) &&
      Math.min(candidate.start.x, candidate.end.x) <= x &&
      Math.max(candidate.start.x, candidate.end.x) >= x,
  )
  if (!segment) throw new Error(`No horizontal segment covers x = ${x}`)
  return segment
}
