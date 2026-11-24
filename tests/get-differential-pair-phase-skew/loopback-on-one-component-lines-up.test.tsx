import { expect, test } from "bun:test"
import { getFirstPhaseSkewPair } from "tests/fixtures/get-first-phase-skew-pair"
import { renderLoopbackBoard } from "tests/fixtures/loopback-board"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { segmentAtX } from "tests/fixtures/segment-at-x"

test("a loopback with all pads on one part lines the traces up by their ends", async () => {
  const circuitJson = await renderLoopbackBoard()
  const pair = getFirstPhaseSkewPair({ circuitJson })

  const middle = segmentAtX({ segments: pair.positive_trace.segments, x: 0 })
  expect(middle.phase_skew).toBe(0)
  expect(pair.max_abs_phase_skew).toBe(0)

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
