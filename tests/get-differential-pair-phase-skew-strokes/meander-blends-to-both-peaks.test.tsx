import { expect, test } from "bun:test"
import { getDifferentialPairPhaseSkewStrokes } from "lib/index"
import { phaseSkewStrokesSvg } from "tests/fixtures/phase-skew-strokes-svg"
import { renderCircuit } from "tests/fixtures/render-circuit"
import { segmentAtX } from "tests/fixtures/segment-at-x"
import { LoadEndMeanderBoard } from "tests/fixtures/stroke-example-boards"

test("each trace blends to the peak for its sign and back to white", async () => {
  const circuitJson = await renderCircuit(<LoadEndMeanderBoard />)
  const strokes = getDifferentialPairPhaseSkewStrokes(circuitJson)

  const xPositions = [-11, 0, 7.5, 11.5]
  const [positiveColors, negativeColors] = [0.6, -0.6].map((y) =>
    xPositions.map((x) => segmentAtX({ segments: strokes, x, y }).color),
  )
  expect(positiveColors).toEqual([
    "rgb(255, 255, 255)",
    "rgb(0, 0, 255)",
    "rgb(128, 128, 255)",
    "rgb(255, 255, 255)",
  ])
  expect(negativeColors).toEqual([
    "rgb(255, 255, 255)",
    "rgb(255, 0, 0)",
    "rgb(255, 128, 128)",
    "rgb(255, 255, 255)",
  ])
  await expect(
    phaseSkewStrokesSvg({
      circuitJson,
      strokes,
      caption: "Load-end meander · Two detours bring the pair back in step",
    }),
  ).toMatchSvgSnapshot(import.meta.path)
})
