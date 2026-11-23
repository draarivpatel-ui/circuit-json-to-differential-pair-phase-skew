import { expect, test } from "bun:test"
import { getDifferentialPairPhaseSkew } from "lib/index"
import { renderPairBoard } from "tests/fixtures/pair-board"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { segmentAtX } from "tests/fixtures/segment-at-x"

test("phase skew ramps between matched runs where the traces split apart", async () => {
  // DN drops 6 mm away between x = -6 and x = 6.
  const circuitJson = await renderPairBoard({
    positivePath: [],
    negativePath: [
      { x: 6, y: 0 },
      { x: 6, y: -6 },
      { x: 18, y: -6 },
      { x: 18, y: 0 },
    ],
    pcbTraceGap: "0.45mm",
  })
  const [pair] = getDifferentialPairPhaseSkew({ circuitJson })

  const beside = segmentAtX({ segments: pair.positive_trace.segments, x: -9 })
  const apart = segmentAtX({ segments: pair.positive_trace.segments, x: 0 })
  expect(beside.phase_skew).toBe(0)
  // Halfway through the split, skew is halfway from 0 to the 12 mm detour,
  // to within the 0.05 mm sampling.
  expect(apart.phase_skew).toBeCloseTo(-6, 1)
  const negativeApart = segmentAtX({
    segments: pair.negative_trace.segments,
    x: 0,
  })
  expect(negativeApart.phase_skew).toBeCloseTo(6, 1)
  // The 12 mm ramp is cut every 0.05 mm, each piece a step further along.
  const ramp = pair.positive_trace.segments.filter(
    (segment) => segment.start.x >= -6 && segment.end.x <= 6,
  )
  expect(ramp).toHaveLength(240)
  for (let index = 1; index < ramp.length; index++) {
    expect(ramp[index].phase_skew ?? 0).toBeLessThan(
      ramp[index - 1].phase_skew ?? 0,
    )
  }
  // Only the measured stretches count toward the maximum: 12 mm of detour.
  expect(pair.max_abs_phase_skew).toBeCloseTo(12, 5)

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
