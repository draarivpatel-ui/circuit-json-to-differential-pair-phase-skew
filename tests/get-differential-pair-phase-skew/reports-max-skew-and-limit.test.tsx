import { expect, test } from "bun:test"
import { ok } from "node:assert/strict"
import { cju } from "@tscircuit/circuit-json-util"
import { getDifferentialPairPhaseSkew } from "lib/index"
import {
  DETOUR_EXTRA_LENGTH,
  renderDifferentialPairBoard,
} from "tests/fixtures/differential-pair-board"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"

test("reports the pair's largest phase skew and its maxLengthSkew", async () => {
  const circuitJson = await renderDifferentialPairBoard({ compensated: true })
  const pairs = getDifferentialPairPhaseSkew({ circuitJson })

  expect(pairs).toHaveLength(1)
  const [bus] = cju(circuitJson).source_bus.list()
  ok(bus)
  expect(pairs[0]?.source_bus_id).toBe(bus.source_bus_id)
  expect(pairs[0]?.max_abs_phase_skew).toBeCloseTo(DETOUR_EXTRA_LENGTH, 5)
  expect(pairs[0]?.max_length_skew).toBe(0.1)

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
