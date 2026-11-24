import { expect, test } from "bun:test"
import { DETOUR_EXTRA_LENGTH } from "tests/fixtures/differential-pair-board"
import { getFirstPhaseSkewPair } from "tests/fixtures/get-first-phase-skew-pair"
import { renderPairBoard } from "tests/fixtures/pair-board"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { segmentAtX } from "tests/fixtures/segment-at-x"

test("a negative trace routed from its load across two vias keeps its layers and distances", async () => {
  // Both traces hop to the bottom layer between x = -6 and x = 6. DP also
  // detours right after its source. DN is routed from its load end.
  const circuitJson = await renderPairBoard({
    positivePath: [
      { x: 2, y: 0 },
      { x: 2.5, y: 1 },
      { x: 3, y: 0 },
      { x: 6, y: 0, via: true, fromLayer: "top", toLayer: "bottom" },
      { x: 18, y: 0, via: true, fromLayer: "bottom", toLayer: "top" },
    ],
    negativePath: [
      { x: -6, y: 0, via: true, fromLayer: "top", toLayer: "bottom" },
      { x: -18, y: 0, via: true, fromLayer: "bottom", toLayer: "top" },
    ],
    pcbTraceGap: "0.45mm",
    negativeFromLoad: true,
  })
  const pair = getFirstPhaseSkewPair({ circuitJson })

  for (const x of [-3, 3]) {
    const positive = segmentAtX({ segments: pair.positive_trace.segments, x })
    const negative = segmentAtX({ segments: pair.negative_trace.segments, x })
    expect(positive.layer).toBe("bottom")
    expect(negative.layer).toBe("bottom")
    expect(positive.phase_skew).toBeCloseTo(DETOUR_EXTRA_LENGTH, 5)
    expect(negative.phase_skew).toBeCloseTo(-DETOUR_EXTRA_LENGTH, 5)
  }
  expect(
    segmentAtX({ segments: pair.negative_trace.segments, x: 9 }).layer,
  ).toBe("top")

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
