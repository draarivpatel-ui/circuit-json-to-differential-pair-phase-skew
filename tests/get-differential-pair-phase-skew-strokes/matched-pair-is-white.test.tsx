import { expect, test } from "bun:test"
import { getDifferentialPairPhaseSkewStrokes } from "lib/index"
import { phaseSkewStrokesSvg } from "tests/fixtures/phase-skew-strokes-svg"
import { renderCircuit } from "tests/fixtures/render-circuit"
import { MatchedPairBoard } from "tests/fixtures/stroke-example-boards"

test("a matched pair has two white strokes widened by 10%", async () => {
  const circuitJson = await renderCircuit(<MatchedPairBoard />)
  const strokes = getDifferentialPairPhaseSkewStrokes(circuitJson)

  expect(strokes).toEqual(
    [0.6, -0.6].map((y) => ({
      layer: "top",
      start: { x: -12, y },
      end: { x: 12, y },
      width: 0.264,
      color: "rgb(255, 255, 255)",
    })),
  )
  await expect(
    phaseSkewStrokesSvg({
      circuitJson,
      strokes,
      caption: "Matched pair · Both traces stay white",
    }),
  ).toMatchSvgSnapshot(import.meta.path)
})
