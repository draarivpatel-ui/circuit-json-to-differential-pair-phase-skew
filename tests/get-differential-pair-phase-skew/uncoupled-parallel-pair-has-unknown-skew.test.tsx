import { expect, test } from "bun:test"
import { getDifferentialPairPhaseSkew } from "lib/index"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { renderPairBoard } from "tests/fixtures/pair-board"
import { segmentAtX } from "tests/fixtures/segment-at-x"

/** DP = 2.4 + 24 + 2.4 = 28.8 mm, DN = 0.65 + 24 + 0.65 = 25.3 mm -> 3.5 mm difference. */
const END_TO_END_SKEW = 28.8 - 25.3

// Geometry check inspired by KiCad QA test `DRCSkew` (`skew_within_diff_pairs_drc` /NET_3P and /NET_3N in test_drc_skew.cpp); dimensions and expected values are our own.
test("fully uncoupled parallel pair with unequal lengths reports unknown skew everywhere and no maximum", async () => {
  // With pcbTraceGap = 0.45 mm and 0.15 mm traces, maxOffset = (0.45 + 0.15) * 1.2 = 0.72 mm.
  // The parallel horizontal runs sit at y = 2.7 and y = -0.95 (3.65 mm apart > 0.72 mm),
  // and the vertical risers at x = -12 and x = 12 run in opposite directions (antiparallel).
  // Total lengths differ by 3.5 mm, yet no coupled run exists anywhere on the pair.
  const circuitJson = await renderPairBoard({
    positivePath: [
      { x: 0, y: 2.4 },
      { x: 24, y: 2.4 },
    ],
    negativePath: [
      { x: 0, y: -0.65 },
      { x: 24, y: -0.65 },
    ],
    pcbTraceGap: "0.45mm",
  })
  const [pair] = getDifferentialPairPhaseSkew({ circuitJson })

  expect(pair.end_to_end_length_delta).toBeCloseTo(END_TO_END_SKEW, 5)

  for (const segments of [
    pair.positive_trace.segments,
    pair.negative_trace.segments,
  ]) {
    expect(segments.length).toBeGreaterThan(0)
    const middle = segmentAtX({ segments, x: 0 })
    expect(middle.phase_skew).toBeUndefined()
    for (const segment of segments) {
      expect(segment.phase_skew).toBeUndefined()
    }
  }

  expect(pair.max_abs_phase_skew).toBeUndefined()

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
