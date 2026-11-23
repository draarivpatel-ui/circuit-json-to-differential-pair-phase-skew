import { expect, test } from "bun:test"
import { checkPcbBusLengthSkew } from "@tscircuit/checks"
import { getDifferentialPairPhaseSkew } from "lib/index"
import {
  DETOUR_EXTRA_LENGTH,
  renderDifferentialPairBoard,
} from "tests/fixtures/differential-pair-board"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"

test("without the compensating detour, the end-to-end length delta is the detour, as the bus length check reports", async () => {
  const circuitJson = await renderDifferentialPairBoard({ compensated: false })

  const [pair] = getDifferentialPairPhaseSkew({ circuitJson })
  const [lengthSkewError] = checkPcbBusLengthSkew(circuitJson)

  expect(pair.end_to_end_length_delta).toBeCloseTo(DETOUR_EXTRA_LENGTH, 5)
  expect(lengthSkewError.actual_length_skew).toBeCloseTo(DETOUR_EXTRA_LENGTH, 5)
  expect(pair.max_length_skew).toBe(lengthSkewError.maximum_length_skew)
  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
