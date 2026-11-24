import { expect, test } from "bun:test"
import { getDifferentialPairPhaseSkewStrokes } from "lib/index"
import { phaseSkewStrokesSvg } from "tests/fixtures/phase-skew-strokes-svg"
import { renderCircuit } from "tests/fixtures/render-circuit"
import { segmentAtX } from "tests/fixtures/segment-at-x"
import { LocalCompensationBoard } from "tests/fixtures/stroke-example-boards"

test("the locally compensated pair returns to white while the other remains skewed", async () => {
  const circuitJson = await renderCircuit(<LocalCompensationBoard />)
  const strokes = getDifferentialPairPhaseSkewStrokes(circuitJson)

  expect(
    [2.8, 1.6, -1.6, -2.8].map(
      (y) => segmentAtX({ segments: strokes, x: 10, y }).color,
    ),
  ).toEqual([
    "rgb(255, 255, 255)",
    "rgb(255, 255, 255)",
    "rgb(0, 0, 255)",
    "rgb(255, 0, 0)",
  ])
  await expect(
    phaseSkewStrokesSvg({
      circuitJson,
      strokes,
      caption: "Local compensation · Only the top pair returns to white",
    }),
  ).toMatchSvgSnapshot(import.meta.path)
})
