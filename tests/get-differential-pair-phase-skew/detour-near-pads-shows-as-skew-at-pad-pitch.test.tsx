import { expect, test } from "bun:test"
import { getFirstPhaseSkewPair } from "tests/fixtures/get-first-phase-skew-pair"
import { renderPairBoard } from "tests/fixtures/pair-board"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { segmentAtX } from "tests/fixtures/segment-at-x"

/** Extra copper DP adds in its detour near the load pads: 2 * 2.2225 mm. */
const DETOUR_EXTRA_LENGTH = 4.445

// Geometry check inspired by KiCad QA tests `DRCLengths` (`time_calculations` CLASS7 in test_drc_lengths.cpp) and `DRCFalsePositiveRegressions` (`issue7975` in test_drc_regressions.cpp); dimensions and expected values are our own.
test("a detour where the pair widens to pad pitch shows as skew, measured at the pad pitch", async () => {
  // The pair fans in from 0.6 mm pad pitch to 0.3 mm over x in [-9.85, 4.0], within
  // (0.15 + 0.15) * 1.2 = 0.36 mm of the declared gap. Like KiCad, the stretches at pad
  // pitch before the first and after the last run are matched against the pads' centre
  // distance instead: 0.6 * 1.2 = 0.72 mm, so they couple too.
  // DP's vertical loop (x in [6, 8], 2.8 mm from DN at its top) doesn't couple, so skew
  // ramps across it from 0 to the loop's 4.445 mm and stays there to the load.
  const circuitJson = await renderPairBoard({
    positivePath: [
      { x: 2, y: 0 },
      { x: 2.15, y: -0.15 },
      { x: 16, y: -0.15 },
      { x: 16.15, y: 0 },
      { x: 18, y: 0 },
      { x: 18, y: 2.2225 },
      { x: 20, y: 2.2225 },
      { x: 20, y: 0 },
    ],
    negativePath: [
      { x: 2, y: 0 },
      { x: 2.15, y: 0.15 },
      { x: 16, y: 0.15 },
      { x: 16.15, y: 0 },
    ],
    pcbTraceGap: "0.15mm",
  })
  const pair = getFirstPhaseSkewPair({ circuitJson })

  expect(pair.end_to_end_length_delta).toBeCloseTo(DETOUR_EXTRA_LENGTH, 5)

  for (const x of [-11, -3, 5]) {
    for (const segments of [
      pair.positive_trace.segments,
      pair.negative_trace.segments,
    ]) {
      const segment = segmentAtX({ segments, x })
      expect(segment.phase_skew).toBe(0)
    }
  }

  const positiveOverLoop = segmentAtX({
    segments: pair.positive_trace.segments,
    x: 7,
  })
  expect(positiveOverLoop.phase_skew).toBeGreaterThan(0)
  expect(positiveOverLoop.phase_skew).toBeLessThan(DETOUR_EXTRA_LENGTH)

  const positiveAfter = segmentAtX({
    segments: pair.positive_trace.segments,
    x: 10,
  })
  const negativeAfter = segmentAtX({
    segments: pair.negative_trace.segments,
    x: 10,
  })
  expect(positiveAfter.phase_skew).toBeCloseTo(DETOUR_EXTRA_LENGTH, 5)
  expect(negativeAfter.phase_skew).toBeCloseTo(-DETOUR_EXTRA_LENGTH, 5)
  expect(pair.max_abs_phase_skew).toBeCloseTo(DETOUR_EXTRA_LENGTH, 5)

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
