import { expect, test } from "bun:test"
import { cju } from "@tscircuit/circuit-json-util"
import { getFirstPhaseSkewPair } from "tests/fixtures/get-first-phase-skew-pair"
import { renderPairBoard } from "tests/fixtures/pair-board"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { segmentAtX } from "tests/fixtures/segment-at-x"

test("without a stackup, each via is as long as the board is thick", async () => {
  // A 0.8 mm board with no pcb_stackup: DN hops top -> bottom -> top.
  const circuitJson = await renderPairBoard({
    positivePath: [],
    negativePath: [
      { x: 6, y: 0, via: true, fromLayer: "top", toLayer: "bottom" },
      { x: 18, y: 0, via: true, fromLayer: "bottom", toLayer: "top" },
    ],
    pcbTraceGap: "0.45mm",
    thickness: "0.8mm",
  })
  expect(cju(circuitJson).pcb_stackup.list()).toEqual([])

  const pair = getFirstPhaseSkewPair({ circuitJson })
  const { segments } = pair.positive_trace
  expect(segmentAtX({ segments, x: 0 }).phase_skew).toBeCloseTo(-0.8, 5)
  expect(segmentAtX({ segments, x: 9 }).phase_skew).toBeCloseTo(-1.6, 5)
  expect(pair.max_abs_phase_skew).toBeCloseTo(1.6, 5)
  expect(pair.end_to_end_length_delta).toBeCloseTo(-1.6, 5)
  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
