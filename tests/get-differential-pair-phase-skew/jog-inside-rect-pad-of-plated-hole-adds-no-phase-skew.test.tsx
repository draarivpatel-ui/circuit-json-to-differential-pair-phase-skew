import { expect, test } from "bun:test"
import { cju } from "@tscircuit/circuit-json-util"
import { getFirstPhaseSkewPair } from "tests/fixtures/get-first-phase-skew-pair"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { renderSourcePadBoard } from "tests/fixtures/source-pad-board"

test("a jog inside the rectangular pad of a plated hole adds no phase skew", async () => {
  // DP's source is a 3 mm square pad around a 0.6 mm drill, with no hole
  // offsets given. DP jogs inside the square's copper before leaving it, so
  // the jog is clipped against the square's outline.
  const circuitJson = await renderSourcePadBoard({
    sourcePad: (
      <platedhole
        portHints={["1"]}
        shape="circular_hole_with_rect_pad"
        holeDiameter="0.6mm"
        rectPadWidth="3mm"
        rectPadHeight="3mm"
      />
    ),
    positivePath: [
      { x: 0.8, y: 0.8 },
      { x: 1, y: 0 },
      { x: 4, y: 0 },
    ],
  })
  expect(cju(circuitJson).pcb_plated_hole.list()[0]).toMatchObject({
    shape: "circular_hole_with_rect_pad",
    hole_offset_x: undefined,
  })

  const pair = getFirstPhaseSkewPair({ circuitJson })
  expect(pair.end_to_end_length_delta).toBe(0)
  expect(pair.max_abs_phase_skew).toBe(0)

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
