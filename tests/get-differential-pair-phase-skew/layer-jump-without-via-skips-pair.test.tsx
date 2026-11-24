import { expect, test } from "bun:test"
import { getDifferentialPairPhaseSkew } from "lib/index"
import { createBasicAutorouter } from "tests/fixtures/create-basic-autorouter"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { renderCircuit } from "tests/fixtures/render-circuit"

test("a layer jump between wire points with no via skips the pair instead of inventing copper", async () => {
  // DP's router output steps from a top wire point at x = -6 to a bottom
  // wire point at x = -2 with nothing between them. Copper renderers draw no
  // copper there, so DP's copper isn't continuous and the pair can't be
  // measured.
  const circuitJson = await renderCircuit(
    <board
      width="24mm"
      height="6mm"
      autorouter={{
        algorithmFn: createBasicAutorouter(async (simpleRouteJson) =>
          simpleRouteJson.connections.map((connection, index) => {
            const [start, end] = connection.pointsToConnect
            if (start.layer === end.layer) {
              return {
                type: "pcb_trace",
                pcb_trace_id: `trace_${index}`,
                connection_name: connection.name,
                route: [
                  { ...start, route_type: "wire", width: 0.15 },
                  { ...end, route_type: "wire", width: 0.15 },
                ],
              }
            }
            return {
              type: "pcb_trace",
              pcb_trace_id: `trace_${index}`,
              connection_name: connection.name,
              route: [
                { ...start, route_type: "wire", width: 0.15 },
                {
                  x: -6,
                  y: start.y,
                  route_type: "wire",
                  width: 0.15,
                  layer: "top",
                },
                {
                  x: -2,
                  y: start.y,
                  route_type: "wire",
                  width: 0.15,
                  layer: "bottom",
                },
                { ...end, route_type: "wire", width: 0.15 },
              ],
            }
          }),
        ),
      }}
    >
      <testpoint
        name="TP_SRC"
        footprintVariant="pad"
        padDiameter="0.3mm"
        doNotPlace
        pcbX={-9}
        pcbY={0.45}
      />
      <testpoint
        name="TP_LOAD"
        footprintVariant="pad"
        padDiameter="0.3mm"
        doNotPlace
        pcbX={9}
        pcbY={0.45}
        layer="bottom"
      />
      <testpoint
        name="TN_SRC"
        footprintVariant="pad"
        padDiameter="0.3mm"
        doNotPlace
        pcbX={-9}
        pcbY={-0.45}
        layer="bottom"
      />
      <testpoint
        name="TN_LOAD"
        footprintVariant="pad"
        padDiameter="0.3mm"
        doNotPlace
        pcbX={9}
        pcbY={-0.45}
        layer="bottom"
      />
      <trace name="DP" from=".TP_SRC > .pin1" to=".TP_LOAD > .pin1" />
      <trace name="DN" from=".TN_SRC > .pin1" to=".TN_LOAD > .pin1" />
      <differentialpair
        name="PAIR"
        positiveConnection="DP"
        negativeConnection="DN"
        pcbTraceGap="0.75mm"
      />
    </board>,
  )

  expect(getDifferentialPairPhaseSkew({ circuitJson })).toEqual([])

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
