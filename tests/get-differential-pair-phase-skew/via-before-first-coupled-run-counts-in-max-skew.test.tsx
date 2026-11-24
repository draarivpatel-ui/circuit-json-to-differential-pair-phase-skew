import { expect, test } from "bun:test"
import { getDifferentialPairPhaseSkew } from "lib/index"
import { renderPairBoard } from "tests/fixtures/pair-board"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { segmentAtX } from "tests/fixtures/segment-at-x"

test("a via right before the first coupled run still counts toward the maximum", async () => {
  // Mirror the last-via case: DN starts away from DP and returns to top at
  // x = 6. DP's detour makes the two traces equal just after DN's return via,
  // so the 1.6 mm skew just before it is only known from the via step.
  const circuitJson = await renderPairBoard({
    positivePath: [
      { x: 4, y: 0 },
      { x: 4, y: 3.6 },
      { x: 6, y: 3.6 },
      { x: 6, y: 0 },
    ],
    negativePath: [
      { x: 0, y: -2 },
      { x: 2, y: -2 },
      { x: 2, y: 0, via: true, fromLayer: "top", toLayer: "bottom" },
      { x: 18, y: 0, via: true, fromLayer: "bottom", toLayer: "top" },
    ],
    pcbTraceGap: "0.45mm",
  })

  const [pair] = getDifferentialPairPhaseSkew({ circuitJson })

  const before = segmentAtX({ segments: pair.positive_trace.segments, x: 0 })
  const after = segmentAtX({ segments: pair.positive_trace.segments, x: 9 })
  expect(before.phase_skew).toBeUndefined()
  expect(after.phase_skew).toBe(0)
  expect(pair.positive_trace).toMatchObject({
    max_phase_skew: 1.6,
    min_phase_skew: 0,
  })
  expect(pair.negative_trace).toMatchObject({
    max_phase_skew: 0,
    min_phase_skew: -1.6,
  })
  expect(pair.max_abs_phase_skew).toBeCloseTo(1.6, 5)

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
