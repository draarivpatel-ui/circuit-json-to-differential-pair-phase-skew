import { expect, test } from "bun:test"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { getDifferentialPairPhaseSkew } from "lib/index"
import { renderPairBoard } from "tests/fixtures/pair-board"
import { segmentAtX } from "tests/fixtures/segment-at-x"

test("without pcbTraceGap the pair is still coupled at its routed spacing", async () => {
  const circuitJson = await renderPairBoard({
    positivePath: [],
    negativePath: [],
  })
  const [pair] = getDifferentialPairPhaseSkew({ circuitJson })

  const middle = segmentAtX({ segments: pair.positive_trace.segments, x: 0 })
  expect(middle.phase_skew).toBe(0)

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
