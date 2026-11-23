import { expect, test } from "bun:test"
import { getDifferentialPairPhaseSkew } from "lib/index"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { renderPairBoard } from "tests/fixtures/pair-board"

/** How far DN's far side bends out at x = 0, in mm. */
const NEGATIVE_BEND_MM = 0.09

/** Extra copper the bend adds to DN: two 10 mm legs instead of one 20 mm run, in mm (about 0.0008). */
const NEGATIVE_EXTRA_LENGTH_MM = 2 * Math.hypot(10, NEGATIVE_BEND_MM) - 20

/** Length of DP's unmatched stretch: 3 mm out, 20 mm across and 3 mm back, in mm. */
const UNMATCHED_LENGTH_MM = 26

test("a sub-micron phase skew ramp keeps its gradient instead of one flat piece", async () => {
  // The traces split 3 mm apart between x = -10 and x = 10. DN's far side
  // bends out 0.09 mm, so DN comes back about 0.0008 mm longer and DP's
  // phase skew ramps from 0 down to about -0.0008 mm across the split.
  const circuitJson = await renderPairBoard({
    positivePath: [
      { x: 2, y: 0 },
      { x: 2, y: 3 },
      { x: 22, y: 3 },
      { x: 22, y: 0 },
    ],
    negativePath: [
      { x: 2, y: 0 },
      { x: 2, y: -3 },
      { x: 12, y: -3 - NEGATIVE_BEND_MM },
      { x: 22, y: -3 },
      { x: 22, y: 0 },
    ],
    pcbTraceGap: "0.45mm",
  })
  const [pair] = getDifferentialPairPhaseSkew({ circuitJson })
  expect(pair.positive_trace.min_phase_skew).toBeCloseTo(
    -NEGATIVE_EXTRA_LENGTH_MM,
    5,
  )

  // DP's 20 mm across the top of the split, in route order.
  const positiveAcrossSegments = pair.positive_trace.segments.filter(
    (segment) => segment.start.y === 3.3 && segment.end.y === 3.3,
  )
  const firstAcrossSegment = positiveAcrossSegments[0]
  const lastAcrossSegment =
    positiveAcrossSegments[positiveAcrossSegments.length - 1]
  // 3.05 mm and 22.95 mm along the 26 mm ramp, to within one sample.
  expect(firstAcrossSegment.phase_skew ?? 0).toBeCloseTo(
    (-NEGATIVE_EXTRA_LENGTH_MM * 3) / UNMATCHED_LENGTH_MM,
    4,
  )
  expect(lastAcrossSegment.phase_skew ?? 0).toBeCloseTo(
    (-NEGATIVE_EXTRA_LENGTH_MM * 23) / UNMATCHED_LENGTH_MM,
    4,
  )
  // Neighbouring pieces with the same rounded phase skew are joined, so each
  // piece is a step further along the ramp.
  for (let index = 1; index < positiveAcrossSegments.length; index++) {
    expect(positiveAcrossSegments[index].phase_skew ?? 0).toBeLessThan(
      positiveAcrossSegments[index - 1].phase_skew ?? 0,
    )
  }

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
