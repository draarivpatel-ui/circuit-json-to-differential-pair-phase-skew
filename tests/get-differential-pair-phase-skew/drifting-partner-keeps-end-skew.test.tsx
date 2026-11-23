import { expect, test } from "bun:test"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { getDifferentialPairPhaseSkew } from "lib/index"
import { renderPairBoard } from "tests/fixtures/pair-board"

/** DN's slanted 20 mm run is this much longer than DP's straight one, in mm. */
const SLANT_EXTRA_LENGTH = Math.hypot(20, 0.1) - 20

test("a slightly slanted partner keeps the skew it builds along the run", async () => {
  // DN runs from x = -10 to x = 10 while drifting 0.1 mm away from DP.
  const circuitJson = await renderPairBoard({
    positivePath: [{ x: 2, y: 0 }],
    negativePath: [
      { x: 2, y: 0 },
      { x: 22, y: -0.1 },
    ],
    pcbTraceGap: "0.45mm",
  })
  const [pair] = getDifferentialPairPhaseSkew({ circuitJson })

  // The run's skew grows from 0 to the slant's extra length; the maximum
  // comes from its end, not its middle.
  expect(pair.max_abs_phase_skew).toBeCloseTo(SLANT_EXTRA_LENGTH, 5)
  // A change this small (0.25 µm) takes one piece per 10 nm of phase skew,
  // 26 pieces instead of one every 0.05 mm (400).
  const slanted = pair.negative_trace.segments.filter(
    (segment) =>
      segment.phase_skew !== undefined && segment.start.y !== segment.end.y,
  )
  expect(slanted).toHaveLength(26)

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
