import { expect, test } from "bun:test"
import type { AnyCircuitElement } from "circuit-json"
import { getDifferentialPairPhaseSkew } from "lib/index"
import { renderPairBoard } from "tests/fixtures/pair-board"

test("a via to a copper layer the board record doesn't have skips the pair", async () => {
  // DN hops top -> inner1 -> top on a 4-layer board without a stackup, but
  // the board record claims 2 copper layers, as a stale record could. With
  // no inner1 to place, the via length can't be known, so the pair is
  // skipped instead of guessing.
  const circuitJson = await renderPairBoard({
    positivePath: [],
    negativePath: [
      { x: 6, y: 0, via: true, fromLayer: "top", toLayer: "inner1" },
      { x: 18, y: 0, via: true, fromLayer: "inner1", toLayer: "top" },
    ],
    pcbTraceGap: "0.45mm",
    layers: 4,
  })
  const circuitJsonWithTwoLayerBoard = circuitJson.map(
    (element): AnyCircuitElement => {
      if (element.type !== "pcb_board") return element
      return { ...element, num_layers: 2 }
    },
  )

  expect(getDifferentialPairPhaseSkew({ circuitJson })).toHaveLength(1)
  expect(
    getDifferentialPairPhaseSkew({ circuitJson: circuitJsonWithTwoLayerBoard }),
  ).toEqual([])
})
