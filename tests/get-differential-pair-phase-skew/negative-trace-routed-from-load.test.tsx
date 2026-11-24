import { expect, test } from "bun:test"
import { cju } from "@tscircuit/circuit-json-util"
import { getFirstPhaseSkewPair } from "tests/fixtures/get-first-phase-skew-pair"
import { renderPairBoard } from "tests/fixtures/pair-board"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { segmentAtX } from "tests/fixtures/segment-at-x"

test("a negative trace routed from its load pad still lines up", async () => {
  const circuitJson = await renderPairBoard({
    positivePath: [
      { x: 2, y: 0 },
      { x: 2.5, y: 1 },
      { x: 3, y: 0 },
    ],
    negativePath: [],
    pcbTraceGap: "0.45mm",
    negativeFromLoad: true,
  })
  const db = cju(circuitJson)
  const negativeSource = db.source_trace.getWhere({ name: "DN" })
  const negativeTrace = db.pcb_trace.getWhere({
    source_trace_id: negativeSource?.source_trace_id,
  })
  const firstPoint = negativeTrace?.route[0]
  // The stored negative route really starts at the load end.
  expect(firstPoint?.route_type === "wire" && firstPoint.x).toBe(12)

  const pair = getFirstPhaseSkewPair({ circuitJson })

  expect(
    segmentAtX({ segments: pair.positive_trace.segments, x: 0 }).phase_skew,
  ).toBeCloseTo(1.23607, 5)
  expect(
    segmentAtX({ segments: pair.negative_trace.segments, x: 0 }).phase_skew,
  ).toBeCloseTo(-1.23607, 5)

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
