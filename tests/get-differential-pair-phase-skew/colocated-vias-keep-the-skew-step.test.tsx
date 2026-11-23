import { expect, test } from "bun:test"
import { cju } from "@tscircuit/circuit-json-util"
import { getDifferentialPairPhaseSkew } from "lib/index"
import { walkTrace } from "lib/walk-trace"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { renderPairBoard } from "tests/fixtures/pair-board"
import { segmentAtX } from "tests/fixtures/segment-at-x"

test("colocated vias keep their full skew step between straight runs", async () => {
  const circuitJson = await renderPairBoard({
    positivePath: [],
    negativePath: [
      { x: 10, y: 0, via: true, fromLayer: "top", toLayer: "bottom" },
      { x: 10, y: 0, via: true, fromLayer: "bottom", toLayer: "top" },
    ],
    pcbTraceGap: "0.45mm",
    thickness: "0.8mm",
  })
  const [pair] = getDifferentialPairPhaseSkew({ circuitJson })

  const before = segmentAtX({ segments: pair.positive_trace.segments, x: -4 })
  const after = segmentAtX({ segments: pair.positive_trace.segments, x: 0 })
  expect(before.phase_skew).toBe(0)
  expect(after.phase_skew).toBeCloseTo(-1.6, 5)
  expect(pair.max_abs_phase_skew).toBeCloseTo(1.6, 5)

  const trace = cju(circuitJson).pcb_trace.get(pair.negative_trace.pcb_trace_id)
  if (trace === null) throw new Error("Missing negative trace")
  const walk = walkTrace({
    route: trace.route,
    pcbStackup: null,
    boardThickness: 0.8,
  })
  if (walk === null) throw new Error("Negative trace has no planar copper")
  const { steps } = walk
  expect(steps).toHaveLength(2)
  expect(steps[0].layerChangeLengthAfterMm).toBeCloseTo(1.6, 5)
  expect(steps[1].layerChangeLengthBeforeMm).toBeCloseTo(1.6, 5)

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
