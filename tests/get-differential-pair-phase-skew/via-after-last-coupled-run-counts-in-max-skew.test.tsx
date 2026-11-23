import { expect, test } from "bun:test"
import { getDifferentialPairPhaseSkew } from "lib/index"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { renderPairBoard } from "tests/fixtures/pair-board"
import { segmentAtX } from "tests/fixtures/segment-at-x"

test("a via right after the last coupled run still counts toward the maximum", async () => {
  // DP runs straight on top; DN drops to bottom at x = -6, returns to top at
  // x = 10, and jogs 2 mm away so it never recouples. The coupled run on
  // [-12, -6] has zero skew, but DN's asymmetric ending via at x = -6 adds
  // a known 1.6 mm step right after the run.
  const circuitJson = await renderPairBoard({
    positivePath: [],
    negativePath: [
      { x: 6, y: 0, via: true, fromLayer: "top", toLayer: "bottom" },
      { x: 22, y: 0, via: true, fromLayer: "bottom", toLayer: "top" },
      { x: 22, y: -2 },
      { x: 24, y: -2 },
    ],
    pcbTraceGap: "0.45mm",
  })

  const [pair] = getDifferentialPairPhaseSkew({ circuitJson })

  const before = segmentAtX({ segments: pair.positive_trace.segments, x: -9 })
  const after = segmentAtX({ segments: pair.positive_trace.segments, x: 0 })
  expect(before.phase_skew).toBe(0)
  expect(after.phase_skew).toBeUndefined()
  expect(pair.max_abs_phase_skew).toBeCloseTo(1.6, 5)

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
