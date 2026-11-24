import { expect, spyOn, test } from "bun:test"
import { getDifferentialPairPhaseSkewStrokes } from "lib/index"
import { renderCircuit } from "tests/fixtures/render-circuit"
import { segmentAtX } from "tests/fixtures/segment-at-x"
import { LoadEndMeanderBoard } from "tests/fixtures/stroke-example-boards"

test("an invalid override warns once and retains the other overrides", async () => {
  const circuitJson = await renderCircuit(<LoadEndMeanderBoard />)
  const warn = spyOn(console, "warn").mockImplementation(() => {})
  try {
    const strokes = getDifferentialPairPhaseSkewStrokes(circuitJson, {
      colors: { positive: "rgb(,0,0)", negative: "#123" },
    })

    expect(segmentAtX({ segments: strokes, x: 0, y: 0.6 }).color).toBe(
      "rgb(0, 0, 255)",
    )
    expect(segmentAtX({ segments: strokes, x: 0, y: -0.6 }).color).toBe(
      "rgb(17, 34, 51)",
    )
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      "Invalid phase skew colour 'rgb(,0,0)', using 'rgb(0, 0, 255)'",
    )
  } finally {
    warn.mockRestore()
  }
})
