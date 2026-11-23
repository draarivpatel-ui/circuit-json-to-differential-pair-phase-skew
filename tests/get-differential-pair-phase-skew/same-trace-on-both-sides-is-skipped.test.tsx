import { expect, test } from "bun:test"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { getDifferentialPairPhaseSkew } from "lib/index"
import { renderPairBoard } from "tests/fixtures/pair-board"

test("a pair that names the same trace on both sides is skipped", async () => {
  const circuitJson = await renderPairBoard({
    positivePath: [],
    negativePath: [],
    positiveOnBothSides: true,
  })
  const pairs = getDifferentialPairPhaseSkew({ circuitJson })

  expect(pairs).toEqual([])

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
