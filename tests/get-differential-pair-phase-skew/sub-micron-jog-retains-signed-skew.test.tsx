import { expect, test } from "bun:test"
import { getDifferentialPairPhaseSkew } from "lib/index"
import { renderPairBoard } from "tests/fixtures/pair-board"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { segmentAtX } from "tests/fixtures/segment-at-x"

/** Extra copper added by the 0.5 µm triangular jog (~0.00041 mm, below 0.0005 mm). */
const JOG_EXTRA_LENGTH = 2 * Math.hypot(0.0005, 0.0005) - 0.001

test("a sub-micron jog retains signed phase skew in the calculation output", async () => {
  // DP takes a 0.5 µm jog at x = -2, adding ~0.00041 mm of copper. The 14 mm
  // coupled run after the jog retains that skew to within 10 nm.
  const circuitJson = await renderPairBoard({
    positivePath: [
      { x: 10, y: 0 },
      { x: 10.0005, y: 0.0005 },
      { x: 10.001, y: 0 },
    ],
    negativePath: [],
    pcbTraceGap: "0.45mm",
  })

  const [pair] = getDifferentialPairPhaseSkew({ circuitJson })
  expect(pair.max_abs_phase_skew).toBeCloseTo(JOG_EXTRA_LENGTH, 5)

  const positiveAfter = segmentAtX({
    segments: pair.positive_trace.segments,
    x: 5,
  })
  const negativeAfter = segmentAtX({
    segments: pair.negative_trace.segments,
    x: 5,
  })
  expect(positiveAfter.phase_skew).toBeCloseTo(JOG_EXTRA_LENGTH, 5)
  expect(negativeAfter.phase_skew).toBeCloseTo(-JOG_EXTRA_LENGTH, 5)

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
