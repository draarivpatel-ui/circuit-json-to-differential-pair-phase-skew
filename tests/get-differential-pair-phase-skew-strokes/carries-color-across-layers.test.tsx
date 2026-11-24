import { expect, test } from "bun:test"
import { getDifferentialPairPhaseSkewStrokes } from "lib/index"
import { phaseSkewStrokesSvg } from "tests/fixtures/phase-skew-strokes-svg"
import { renderCircuit } from "tests/fixtures/render-circuit"
import { segmentAtX } from "tests/fixtures/segment-at-x"
import { LayerChangeBoard } from "tests/fixtures/stroke-example-boards"

test("strokes keep their layer and color through a layer change", async () => {
  const circuitJson = await renderCircuit(<LayerChangeBoard />)
  const strokes = getDifferentialPairPhaseSkewStrokes(circuitJson)

  for (const y of [0.6, -0.6]) {
    const top = segmentAtX({ segments: strokes, x: -2, y })
    const bottom = segmentAtX({ segments: strokes, x: 2, y })
    expect(top.layer).toBe("top")
    expect(bottom.layer).toBe("bottom")
    expect(bottom.color).toBe(top.color)
    expect(bottom.color).not.toBe("rgb(255, 255, 255)")
    expect(bottom.pcb_trace_id).toBe(top.pcb_trace_id)
  }
  await expect(
    phaseSkewStrokesSvg({
      circuitJson,
      strokes,
      caption: "Layer change · Phase skew carries across both vias",
    }),
  ).toMatchSvgSnapshot(import.meta.path)
})
