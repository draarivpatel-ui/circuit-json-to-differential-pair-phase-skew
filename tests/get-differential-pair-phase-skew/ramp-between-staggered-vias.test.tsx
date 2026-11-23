import { expect, test } from "bun:test"
import { getDifferentialPairPhaseSkew } from "lib/index"
import { phaseSkewSvg } from "tests/fixtures/phase-skew-svg"
import { renderPairBoard } from "tests/fixtures/pair-board"
import { segmentAtX } from "tests/fixtures/segment-at-x"

test("an interpolated ramp between staggered vias starts after the entry via and ends before the exit via", async () => {
  // DP drops to bottom at x = -6 (adding 1.6 mm) and runs an 8 mm detour on
  // bottom between x = -6 and x = 0 (2 mm longer than DN's 6 mm straight top
  // run). DN drops to bottom at x = 0 (adding 1.6 mm), then both return to top
  // together at x = 6.
  //
  // Across the uncoupled stretch, skew steps to ±1.6 mm immediately at x = -6
  // and ramps linearly over each trace's copper (not including the vias) to
  // ±3.6 mm just before DN's via at x = 0, then steps to ±2.0 mm on bottom.
  const circuitJson = await renderPairBoard({
    positivePath: [
      { x: 6, y: 0, via: true, fromLayer: "top", toLayer: "bottom" },
      { x: 7, y: 0 },
      { x: 7, y: 1 },
      { x: 11, y: 1 },
      { x: 11, y: 0 },
      { x: 18, y: 0, via: true, fromLayer: "bottom", toLayer: "top" },
    ],
    negativePath: [
      { x: 12, y: 0, via: true, fromLayer: "top", toLayer: "bottom" },
      { x: 18, y: 0, via: true, fromLayer: "bottom", toLayer: "top" },
    ],
    pcbTraceGap: "0.45mm",
  })

  const [pair] = getDifferentialPairPhaseSkew({ circuitJson })

  // Coupled stretches before and after the staggered vias.
  expect(
    segmentAtX({ segments: pair.positive_trace.segments, x: -9 }).phase_skew,
  ).toBe(0)
  expect(
    segmentAtX({ segments: pair.positive_trace.segments, x: 3 }).phase_skew,
  ).toBeCloseTo(2, 5)
  expect(
    segmentAtX({ segments: pair.negative_trace.segments, x: 3 }).phase_skew,
  ).toBeCloseTo(-2, 5)
  expect(pair.max_abs_phase_skew).toBeCloseTo(3.6, 5)

  // DP's ramp starts after its via at x = -6 (gapFrom = previous.to + endVia).
  // Ramps are sampled in 0.05 mm pieces, so querying at piece midpoints
  // x = -5.525 (0.475 mm into the 8 mm detour) and x = -3.025 (3.975 mm in)
  // checks the exact linear ramp over copper only.
  const dpNearStart = segmentAtX({
    segments: pair.positive_trace.segments,
    x: -5.525,
    y: 0.3,
  })
  const dpMid = segmentAtX({
    segments: pair.positive_trace.segments,
    x: -3.025,
    y: 1.3,
  })
  expect(dpNearStart.phase_skew).toBeCloseTo(1.6 + (2 * 0.475) / 8, 4)
  expect(dpMid.phase_skew).toBeCloseTo(1.6 + (2 * 3.975) / 8, 4)

  // DN's ramp ends before its via at x = 0 (gapTo = run.from - startVia).
  // At piece midpoints x = -3.025 (2.975 mm into DN's 6 mm stretch) and
  // x = -0.525 (5.475 mm in), skew ramps linearly without smearing into the via.
  const dnMid = segmentAtX({
    segments: pair.negative_trace.segments,
    x: -3.025,
    y: -0.3,
  })
  const dnNearEnd = segmentAtX({
    segments: pair.negative_trace.segments,
    x: -0.525,
    y: -0.3,
  })
  expect(dnMid.phase_skew).toBeCloseTo(-1.6 - (2 * 2.975) / 6, 4)
  expect(dnNearEnd.phase_skew).toBeCloseTo(-1.6 - (2 * 5.475) / 6, 4)

  await expect(phaseSkewSvg(circuitJson)).toMatchSvgSnapshot(import.meta.path)
})
