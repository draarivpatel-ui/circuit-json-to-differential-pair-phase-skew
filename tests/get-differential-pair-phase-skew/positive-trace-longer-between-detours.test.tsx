import { expect, test } from "bun:test"
import { getDifferentialPairPhaseSkew } from "lib/index"
import {
  DETOUR_EXTRA_LENGTH,
  renderDifferentialPairBoard,
} from "tests/fixtures/differential-pair-board"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { segmentAtX } from "tests/fixtures/segment-at-x"

test("positive trace is longer by the detour length between the detours", async () => {
  const circuitJson = await renderDifferentialPairBoard({ compensated: true })
  const [pair] = getDifferentialPairPhaseSkew({ circuitJson })

  const positive = segmentAtX({ segments: pair.positive_trace.segments, x: 0 })
  const negative = segmentAtX({ segments: pair.negative_trace.segments, x: 0 })
  expect(positive.phase_skew).toBeCloseTo(DETOUR_EXTRA_LENGTH, 5)
  expect(negative.phase_skew).toBeCloseTo(-DETOUR_EXTRA_LENGTH, 5)

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
