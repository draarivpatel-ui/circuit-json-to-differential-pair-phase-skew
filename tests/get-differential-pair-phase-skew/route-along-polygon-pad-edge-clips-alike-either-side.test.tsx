import { expect, test } from "bun:test"
import type { AnyCircuitElement } from "circuit-json"
import { getFirstPhaseSkewPair } from "tests/fixtures/get-first-phase-skew-pair"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { renderSourcePadBoard } from "tests/fixtures/source-pad-board"

/**
 * DP's phase skew once the routing inside the pad is measured straight from
 * the pad centre to where the route leaves the pad's right edge, at (2, ±1),
 * in mm.
 */
const CLIPPED_EXTRA_LENGTH_MM = Math.hypot(2, 1) + 0.5 + Math.hypot(1.5, 1) - 4

/** Renders DP leaving a 3 mm by 2 mm rectangular polygon pad along its edge at `edgeY`, 1 or -1 mm from the centre. */
function renderEdgeFollowingBoard(edgeY: number): Promise<AnyCircuitElement[]> {
  return renderSourcePadBoard({
    sourcePad: (
      <platedhole
        shape="hole_with_polygon_pad"
        portHints={["1"]}
        holeShape="circle"
        holeDiameter="0.4mm"
        holeOffsetX={0}
        holeOffsetY={0}
        padOutline={[
          { x: -1, y: -1 },
          { x: 2, y: -1 },
          { x: 2, y: 1 },
          { x: -1, y: 1 },
        ]}
      />
    ),
    positivePath: [
      { x: 0.5, y: edgeY },
      { x: 1.5, y: edgeY },
      { x: 2.5, y: edgeY },
      { x: 4, y: 0 },
    ],
  })
}

test("a route along a polygon pad's edge is clipped alike on either edge", async () => {
  // DP runs from the pad centre to its top edge, along it and out of the
  // pad's right side. Points on the edge are copper, so the route leaves
  // the pad at (2, 1), and the same route reflected onto the bottom edge
  // measures the same.
  const upperCircuitJson = await renderEdgeFollowingBoard(1)
  const lowerCircuitJson = await renderEdgeFollowingBoard(-1)

  const upperPair = getFirstPhaseSkewPair({
    circuitJson: upperCircuitJson,
  })
  const lowerPair = getFirstPhaseSkewPair({
    circuitJson: lowerCircuitJson,
  })
  expect(upperPair.end_to_end_length_delta).toBeCloseTo(
    CLIPPED_EXTRA_LENGTH_MM,
    5,
  )
  expect(lowerPair.end_to_end_length_delta).toBe(
    upperPair.end_to_end_length_delta,
  )
  expect(lowerPair.max_abs_phase_skew).toBe(upperPair.max_abs_phase_skew)

  await expect(phaseSkewSvg(upperCircuitJson)).toMatchSvgSnapshot(
    import.meta.path,
  )
})
