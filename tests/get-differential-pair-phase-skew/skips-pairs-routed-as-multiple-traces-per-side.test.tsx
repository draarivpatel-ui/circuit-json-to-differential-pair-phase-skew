import { expect, test } from "bun:test"
import { cju } from "@tscircuit/circuit-json-util"
import { createBasicAutorouter } from "tests/fixtures/create-basic-autorouter"
import { getDifferentialPairPhaseSkew } from "lib/index"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { renderCircuit } from "tests/fixtures/render-circuit"

test("skips a pair routed as two PCB traces per side", async () => {
  const circuitJson = await renderCircuit(
    <board
      width="30mm"
      height="6mm"
      autorouter={{
        algorithmFn: createBasicAutorouter(async (simpleRouteJson) =>
          simpleRouteJson.connections.flatMap((connection, index) => {
            const [start, end] = connection.pointsToConnect
            const middle = { x: 0, y: start.y, layer: "top" as const }
            return [
              {
                type: "pcb_trace" as const,
                pcb_trace_id: `trace_${index}_a`,
                connection_name: connection.name,
                route: [
                  { ...start, route_type: "wire" as const, width: 0.15 },
                  { ...middle, route_type: "wire" as const, width: 0.15 },
                ],
              },
              {
                type: "pcb_trace" as const,
                pcb_trace_id: `trace_${index}_b`,
                connection_name: connection.name,
                route: [
                  { ...middle, route_type: "wire" as const, width: 0.15 },
                  { ...end, route_type: "wire" as const, width: 0.15 },
                ],
              },
            ]
          }),
        ),
      }}
    >
      <testpoint
        name="P1"
        footprintVariant="pad"
        padDiameter={0.3}
        doNotPlace
        pcbX={-12}
        pcbY={0.5}
      />
      <testpoint
        name="P2"
        footprintVariant="pad"
        padDiameter={0.3}
        doNotPlace
        pcbX={12}
        pcbY={0.5}
      />
      <testpoint
        name="N1"
        footprintVariant="pad"
        padDiameter={0.3}
        doNotPlace
        pcbX={-12}
        pcbY={-0.5}
      />
      <testpoint
        name="N2"
        footprintVariant="pad"
        padDiameter={0.3}
        doNotPlace
        pcbX={12}
        pcbY={-0.5}
      />
      <trace name="DP" from=".P1 > .pin1" to=".P2 > .pin1" />
      <trace name="DN" from=".N1 > .pin1" to=".N2 > .pin1" />
      <differentialpair
        name="USB"
        positiveConnection="DP"
        negativeConnection="DN"
        pcbTraceGap="0.85mm"
      />
      <pcbnotetext
        pcbY={2}
        fontSize={0.4}
        text="The router returns each side as two PCB traces, split at x = 0"
      />
    </board>,
  )
  expect(cju(circuitJson).pcb_trace.list()).toHaveLength(4)
  expect(getDifferentialPairPhaseSkew({ circuitJson })).toEqual([])
  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
