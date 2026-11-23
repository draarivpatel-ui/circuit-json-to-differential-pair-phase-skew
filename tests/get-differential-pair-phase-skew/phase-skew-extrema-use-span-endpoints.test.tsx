import { expect, test } from "bun:test"
import { getDifferentialPairPhaseSkew } from "lib/index"
import { renderPairBoard } from "tests/fixtures/pair-board"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"

/** DN's slanted 20 mm run is ~0.00196 mm longer than DP's straight run. */
const SLANT_EXTRA_LENGTH = Math.hypot(20, 0.28) - 20

test("each trace's phase skew extrema come from known span endpoints, not piece midpoints", async () => {
  // DN slants 0.28 mm over 20 mm (still parallel at cos ~0.999902) inside a
  // 0.8 mm gap, so the whole run is coupled and its phase skew ramps from 0
  // to ~0.00196 mm at its end.
  const circuitJson = await renderPairBoard({
    positivePath: [{ x: 2, y: 0 }],
    negativePath: [
      { x: 2, y: 0 },
      { x: 22, y: -0.28 },
    ],
    pcbTraceGap: "0.8mm",
  })

  const [pair] = getDifferentialPairPhaseSkew({ circuitJson })
  const slanted = pair.negative_trace.segments.filter(
    (segment) =>
      segment.phase_skew !== undefined && segment.start.y !== segment.end.y,
  )
  // Every piece's midpoint is short of the run's end.
  for (const segment of slanted) {
    expect(segment.phase_skew ?? 0).toBeLessThanOrEqual(
      pair.negative_trace.max_phase_skew,
    )
  }

  // Scale comes from the 0.00196 mm span endpoint.
  expect(pair.negative_trace.max_phase_skew).toBeCloseTo(SLANT_EXTRA_LENGTH, 5)
  expect(pair.negative_trace.min_phase_skew).toBe(0)
  expect(pair.positive_trace.max_phase_skew).toBe(0)
  expect(pair.positive_trace.min_phase_skew).toBeCloseTo(-SLANT_EXTRA_LENGTH, 5)

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
