import { expect, test } from "bun:test"
import { getFirstPhaseSkewPair } from "tests/fixtures/get-first-phase-skew-pair"
import { renderPairBoard } from "tests/fixtures/pair-board"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { segmentAtX } from "tests/fixtures/segment-at-x"

test("without pcbTraceGap the pair is still coupled at its routed spacing", async () => {
  const circuitJson = await renderPairBoard({
    positivePath: [],
    negativePath: [],
  })
  const pair = getFirstPhaseSkewPair({ circuitJson })

  const middle = segmentAtX({ segments: pair.positive_trace.segments, x: 0 })
  expect(middle.phase_skew).toBe(0)

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
