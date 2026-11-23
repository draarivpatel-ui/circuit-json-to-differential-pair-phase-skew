import { expect, test } from "bun:test"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { getDifferentialPairPhaseSkew } from "lib/index"
import { renderSpanningConnectorBoard } from "tests/fixtures/spanning-connector-board"
import { segmentAtX } from "tests/fixtures/segment-at-x"

test("a connector at the start of one trace and the end of the other doesn't flip the pair", async () => {
  const circuitJson = await renderSpanningConnectorBoard()
  const [pair] = getDifferentialPairPhaseSkew({ circuitJson })

  for (const segments of [
    pair.positive_trace.segments,
    pair.negative_trace.segments,
  ]) {
    const middle = segmentAtX({ segments, x: 0 })
    expect(middle.phase_skew).toBe(0)
  }
  expect(pair.max_abs_phase_skew).toBe(0)

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
