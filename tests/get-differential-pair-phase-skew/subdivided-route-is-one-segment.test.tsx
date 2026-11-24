import { expect, test } from "bun:test"
import { getFirstPhaseSkewPair } from "tests/fixtures/get-first-phase-skew-pair"
import { type PairPathPoint, renderPairBoard } from "tests/fixtures/pair-board"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"

test("a straight route split into many points is measured as one segment", async () => {
  const everyMillimetre: PairPathPoint[] = []
  for (let x = 1; x < 24; x++) everyMillimetre.push({ x, y: 0 })

  const circuitJson = await renderPairBoard({
    positivePath: everyMillimetre,
    negativePath: [],
    pcbTraceGap: "0.45mm",
  })
  const pair = getFirstPhaseSkewPair({ circuitJson })

  expect(pair.positive_trace.segments).toHaveLength(1)
  expect(pair.positive_trace.segments[0]?.phase_skew).toBe(0)

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
