import { expect, test } from "bun:test"
import { cju } from "@tscircuit/circuit-json-util"
import { getDifferentialPairPhaseSkew } from "lib/index"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { renderCircuit } from "tests/fixtures/render-circuit"

test("a jog up to a via inside the source pad adds only the via's layer change", async () => {
  // DP jogs inside its 2 mm source pad to a via at x = -8.6, runs on bottom
  // and comes back up through a second via at x = 1. Inside the pad the
  // route runs straight from the pad centre to the via, so DP is ahead of
  // DN by just the two vias' layer changes.
  const circuitJson = await renderCircuit(
    <board width="24mm" height="8mm" routeRemaining={false}>
      <chip
        name="TP_SRC"
        pcbX={-9}
        pcbY={1}
        footprint={
          <footprint>
            <smtpad portHints={["1"]} shape="circle" radius="1mm" />
          </footprint>
        }
      />
      <testpoint
        name="TP_LOAD"
        footprintVariant="pad"
        padDiameter="0.3mm"
        doNotPlace
        pcbX={9}
        pcbY={1}
      />
      <testpoint
        name="TN_SRC"
        footprintVariant="pad"
        padDiameter="0.3mm"
        doNotPlace
        pcbX={-9}
        pcbY={-1}
      />
      <testpoint
        name="TN_LOAD"
        footprintVariant="pad"
        padDiameter="0.3mm"
        doNotPlace
        pcbX={9}
        pcbY={-1}
      />
      <trace
        name="DP"
        from=".TP_SRC > .pin1"
        to=".TP_LOAD > .pin1"
        thickness="0.15mm"
        pcbPath={[
          { x: 0.2, y: 0.2 },
          { x: 0.4, y: 0, via: true, toLayer: "bottom" },
          { x: 10, y: 0, via: true, toLayer: "top" },
        ]}
      />
      <trace
        name="DN"
        from=".TN_SRC > .pin1"
        to=".TN_LOAD > .pin1"
        thickness="0.15mm"
        pcbPath={[]}
      />
      <differentialpair
        name="PAIR"
        positiveConnection="DP"
        negativeConnection="DN"
        pcbTraceGap="1.85mm"
      />
    </board>,
  )

  const boardThickness = cju(circuitJson).pcb_board.list()[0].thickness
  const [pair] = getDifferentialPairPhaseSkew({ circuitJson })
  expect(pair.end_to_end_length_delta).toBeCloseTo(2 * boardThickness, 5)
  const [firstPositiveSegment] = pair.positive_trace.segments
  expect(firstPositiveSegment.start).toEqual({ x: -9, y: 1 })
  expect(firstPositiveSegment.end).toEqual({ x: -8.6, y: 1 })

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
