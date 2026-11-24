import { expect, test } from "bun:test"
import { getDifferentialPairPhaseSkewStrokes } from "lib/index"
import { phaseSkewStrokesSvg } from "tests/fixtures/phase-skew-strokes-svg"
import { renderCircuit } from "tests/fixtures/render-circuit"
import { segmentAtX } from "tests/fixtures/segment-at-x"
import { CustomColorsBoard } from "tests/fixtures/stroke-example-boards"

test("renders custom zero, positive and negative colours as opaque RGB", async () => {
  const circuitJson = await renderCircuit(<CustomColorsBoard />)
  const strokes = getDifferentialPairPhaseSkewStrokes(circuitJson, {
    colors: {
      zero: "#fEc",
      positive: "#29e2bd",
      negative: "rgb(255, 141, 50)",
    },
  })

  expect(
    [-10, 0, 10].map((x) => segmentAtX({ segments: strokes, x, y: 0.6 }).color),
  ).toEqual(["rgb(255, 238, 204)", "rgb(255, 141, 50)", "rgb(41, 226, 189)"])
  await expect(
    phaseSkewStrokesSvg({
      circuitJson,
      strokes,
      caption: "Custom colours · Teal leads, orange trails, cream is in step",
    }),
  ).toMatchSvgSnapshot(import.meta.path)
})
