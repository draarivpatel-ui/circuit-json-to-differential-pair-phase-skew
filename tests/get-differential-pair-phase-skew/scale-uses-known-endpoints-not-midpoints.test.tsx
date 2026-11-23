import { expect, test } from "bun:test"
import { getDifferentialPairPhaseSkew } from "lib/index"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { renderPairBoard } from "tests/fixtures/pair-board"

/** DN's slanted 20 mm run is ~0.00196 mm longer than DP's straight run. */
const SLANT_EXTRA_LENGTH = Math.hypot(20, 0.28) - 20

test("each trace skew scale comes from known span endpoints, not piece midpoints", async () => {
  // DN slants 0.28 mm over 20 mm (still parallel at cos ~0.999902) inside a
  // 0.8 mm gap, so the whole run is coupled and split into 2 pieces with
  // midpoints ~0.00049 and ~0.00147 mm while the endpoint peaks at ~0.00196 mm.
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
  expect(slanted).toHaveLength(2)

  // Scale comes from the 0.00196 mm span endpoint, not the 0.00147 mm midpoint.
  expect(pair.negative_trace.max_phase_skew).toBeCloseTo(SLANT_EXTRA_LENGTH, 5)
  expect(pair.negative_trace.min_phase_skew).toBe(0)
  expect(pair.positive_trace.max_phase_skew).toBe(0)
  expect(pair.positive_trace.min_phase_skew).toBeCloseTo(-SLANT_EXTRA_LENGTH, 5)

  const secondPiece = slanted[1]
  expect(secondPiece.phase_skew).toBeCloseTo(0.00147, 5)

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
