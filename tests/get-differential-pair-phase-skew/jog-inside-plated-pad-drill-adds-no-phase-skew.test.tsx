import { expect, test } from "bun:test"
import { getDifferentialPairPhaseSkew } from "lib/index"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { renderCircuit } from "tests/fixtures/render-circuit"

test("a jog inside a plated pad's drill adds no phase skew", async () => {
  // DP leaves the centre of a 2 mm plated pad with a 1.2 mm drill through a
  // small jog inside the drill, then runs beside DN. The drill is part of
  // the pad, so the copper inside the pad is measured straight from its
  // centre to its outer edge at x = -8.
  const circuitJson = await renderCircuit(
    <board width="24mm" height="8mm" routeRemaining={false}>
      <chip
        name="TP_SRC"
        pcbX={-9}
        pcbY={1}
        footprint={
          <footprint>
            <platedhole
              portHints={["1"]}
              shape="circle"
              outerDiameter="2mm"
              holeDiameter="1.2mm"
            />
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
          { x: 0.14, y: 0.14 },
          { x: 0.3, y: 0 },
          { x: 4, y: 0 },
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

  const [pair] = getDifferentialPairPhaseSkew({ circuitJson })
  expect(pair.end_to_end_length_delta).toBe(0)
  expect(pair.max_abs_phase_skew).toBe(0)
  const [firstPositiveSegment] = pair.positive_trace.segments
  expect(firstPositiveSegment.start).toEqual({ x: -9, y: 1 })
  expect(firstPositiveSegment.end.y).toBeCloseTo(1, 9)

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
