import { expect, test } from "bun:test"
import { getDifferentialPairPhaseSkew } from "lib/index"
import { renderPairBoard } from "tests/fixtures/pair-board"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"

test("a run with constant skew is one segment, not one per sample", async () => {
  // An asymmetric detour leaves a constant skew whose two ends differ in
  // the last bits of floating point.
  const circuitJson = await renderPairBoard({
    positivePath: [
      { x: 2, y: 0 },
      { x: 2.3, y: 0.7 },
      { x: 3.1, y: 0 },
    ],
    negativePath: [],
    pcbTraceGap: "0.45mm",
  })
  const [pair] = getDifferentialPairPhaseSkew({ circuitJson })

  const afterDetour = pair.positive_trace.segments.filter(
    (segment) => segment.start.y === 0.3 && segment.start.x >= -8.9,
  )
  expect(afterDetour).toHaveLength(1)
  expect(afterDetour[0].end.x).toBeCloseTo(12, 9)

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
