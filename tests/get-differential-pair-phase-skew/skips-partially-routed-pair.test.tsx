import { expect, test } from "bun:test"
import { cju } from "@tscircuit/circuit-json-util"
import { getDifferentialPairPhaseSkew } from "lib/index"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { renderPairBoard } from "tests/fixtures/pair-board"

test("returns no phase skew report for a partially routed pair", async () => {
  const circuitJson = await renderPairBoard({ positivePath: [] })
  expect(cju(circuitJson).pcb_trace.list()).toHaveLength(1)
  expect(getDifferentialPairPhaseSkew({ circuitJson })).toEqual([])
  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
