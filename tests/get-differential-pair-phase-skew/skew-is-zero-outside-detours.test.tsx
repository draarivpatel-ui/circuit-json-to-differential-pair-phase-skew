import { expect, test } from "bun:test"
import { getDifferentialPairPhaseSkew } from "lib/index"
import { renderDifferentialPairBoard } from "tests/fixtures/differential-pair-board"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { segmentAtX } from "tests/fixtures/segment-at-x"

test("skew is zero before the first detour and after the second", async () => {
  const circuitJson = await renderDifferentialPairBoard({ compensated: true })
  const [pair] = getDifferentialPairPhaseSkew({ circuitJson })

  for (const segments of [
    pair.positive_trace.segments,
    pair.negative_trace.segments,
  ]) {
    expect(segmentAtX({ segments, x: -11 }).phase_skew).toBe(0)
    expect(segmentAtX({ segments, x: 11 }).phase_skew).toBe(0)
  }

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
