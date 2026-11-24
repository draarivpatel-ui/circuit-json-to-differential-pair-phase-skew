import { expect, test } from "bun:test"
import { getDifferentialPairPhaseSkewStrokes } from "lib/index"
import { renderPairBoard } from "tests/fixtures/pair-board"

test("uses the unknown colour for an uncoupled pair", async () => {
  const circuitJson = await renderPairBoard({
    positivePath: [
      { x: 0, y: 2.4 },
      { x: 24, y: 2.4 },
    ],
    negativePath: [
      { x: 0, y: -0.65 },
      { x: 24, y: -0.65 },
    ],
    pcbTraceGap: "0.45mm",
  })
  const defaults = getDifferentialPairPhaseSkewStrokes(circuitJson)
  const custom = getDifferentialPairPhaseSkewStrokes(circuitJson, {
    colors: { unknown: "#456" },
  })

  expect(new Set(defaults.map((stroke) => stroke.color))).toEqual(
    new Set(["rgb(128, 128, 128)"]),
  )
  expect(new Set(custom.map((stroke) => stroke.color))).toEqual(
    new Set(["rgb(68, 85, 102)"]),
  )
})
