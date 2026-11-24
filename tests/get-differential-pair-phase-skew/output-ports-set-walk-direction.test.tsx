import { expect, test } from "bun:test"
import {
  DETOUR_EXTRA_LENGTH,
  renderDirectedPairBoard,
} from "tests/fixtures/directed-pair-board"
import { getFirstPhaseSkewPair } from "tests/fixtures/get-first-phase-skew-pair"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { segmentAtX } from "tests/fixtures/segment-at-x"

test("when each trace has one output end port, both traces walk from the output end", async () => {
  // Both DP and DN are stored receiver (x = -12) -> output driver (x = 12),
  // with DP detouring right after the driver at x = 9..10.
  const circuitJson = await renderDirectedPairBoard()
  const pair = getFirstPhaseSkewPair({ circuitJson })

  // Walking from U_TX (x = 12) to U_RX (x = -12): skew is 0 before DP's
  // detour (x = 11) and +DETOUR_EXTRA_LENGTH from x = 9 all the way to U_RX.
  expect(
    segmentAtX({ segments: pair.positive_trace.segments, x: 11 }).phase_skew,
  ).toBe(0)
  expect(
    segmentAtX({ segments: pair.positive_trace.segments, x: 0 }).phase_skew,
  ).toBeCloseTo(DETOUR_EXTRA_LENGTH, 5)
  expect(
    segmentAtX({ segments: pair.negative_trace.segments, x: 0 }).phase_skew,
  ).toBeCloseTo(-DETOUR_EXTRA_LENGTH, 5)
  expect(
    segmentAtX({ segments: pair.positive_trace.segments, x: -11 }).phase_skew,
  ).toBeCloseTo(DETOUR_EXTRA_LENGTH, 5)

  // Mixed stored directions (DP reversed, DN already from output) also walk from U_TX.
  const mixed = getFirstPhaseSkewPair({
    circuitJson: await renderDirectedPairBoard({ negativeFromOutput: true }),
  })
  expect(
    segmentAtX({ segments: mixed.positive_trace.segments, x: 11 }).phase_skew,
  ).toBe(0)
  expect(
    segmentAtX({ segments: mixed.positive_trace.segments, x: 0 }).phase_skew,
  ).toBeCloseTo(DETOUR_EXTRA_LENGTH, 5)

  // When both ends are marked output (ambiguous), fall back to stored positive order.
  const ambiguous = getFirstPhaseSkewPair({
    circuitJson: await renderDirectedPairBoard({ bothEndsOutput: true }),
  })
  expect(
    segmentAtX({ segments: ambiguous.positive_trace.segments, x: 0 })
      .phase_skew,
  ).toBe(0)
  expect(
    segmentAtX({ segments: ambiguous.positive_trace.segments, x: 11 })
      .phase_skew,
  ).toBeCloseTo(DETOUR_EXTRA_LENGTH, 5)

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
