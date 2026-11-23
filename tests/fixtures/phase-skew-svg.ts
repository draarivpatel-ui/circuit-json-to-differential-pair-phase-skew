import "bun-match-svg"
import { cju } from "@tscircuit/circuit-json-util"
import type { AnyCircuitElement, PcbTraceRoutePoint, Point } from "circuit-json"
import {
  DEFAULT_PHASE_SKEW_COLORS,
  getDifferentialPairPhaseSkew,
  type PhaseSkewSegment,
  type PhaseSkewTrace,
} from "lib/index"

/** Overlay stroke width relative to the trace, matching KiCad's 1.1× inflation. */
const OVERLAY_WIDTH_FACTOR = 1.1

/** SVG pixels per mm. */
const PIXELS_PER_MM = 40

/**
 * Draws the routed copper with each pair's phase skew on top, coloured as
 * KiCad does: white in step, blending to blue where a trace is ahead of its
 * partner and red where it is behind, scaled per trace and sign; grey where
 * unknown. For visual snapshot tests.
 */
export function phaseSkewSvg(circuitJson: AnyCircuitElement[]): string {
  const db = cju(circuitJson)
  const differentialPairPhaseSkews = getDifferentialPairPhaseSkew({
    circuitJson,
  })
  const traces = db.pcb_trace.list()
  const points = traces.flatMap((trace) =>
    trace.route.flatMap((routePoint) => routePointPositions(routePoint)),
  )
  const minX = Math.min(...points.map(({ x }) => x)) - 1
  const maxX = Math.max(...points.map(({ x }) => x)) + 1
  const minY = Math.min(...points.map(({ y }) => y)) - 1
  const maxY = Math.max(...points.map(({ y }) => y)) + 1
  const width = maxX - minX
  const height = maxY - minY
  const copper = traces.flatMap((trace) =>
    trace.route.flatMap((point, index) => {
      const from = trace.route[index - 1]
      if (
        point.route_type !== "wire" ||
        from?.route_type !== "wire" ||
        from.layer !== point.layer
      ) {
        return []
      }
      return [
        `<line x1="${from.x}" y1="${from.y}" x2="${point.x}" y2="${point.y}" stroke="#8d6448" stroke-width="${point.width}"/>`,
      ]
    }),
  )
  const vias = db.pcb_via
    .list()
    .map(
      (via) =>
        `<circle cx="${via.x}" cy="${via.y}" r="${via.outer_diameter / 2}" fill="none" stroke="#ead9bd" stroke-width="0.07"/>`,
    )
  const phaseSkewTraces = differentialPairPhaseSkews.flatMap((pair) => [
    pair.positive_trace,
    pair.negative_trace,
  ])
  const overlay = phaseSkewTraces.flatMap((trace) =>
    trace.segments.flatMap((segment) => phaseSkewLines({ trace, segment })),
  )
  const formattedPeakPhaseSkewsMm = differentialPairPhaseSkews
    .map((pair) => pair.max_abs_phase_skew?.toFixed(5) ?? "unknown")
    .join(", ")
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width * PIXELS_PER_MM)}" height="${Math.ceil(height * PIXELS_PER_MM)}" viewBox="${minX} ${-maxY} ${width} ${height}">
  <rect x="${minX}" y="${-maxY}" width="${width}" height="${height}" fill="#182124"/>
  <g transform="scale(1 -1)">
    ${[...copper, ...overlay, ...vias].join("\n    ")}
  </g>
  <text x="${minX + 0.3}" y="${-maxY + 0.48}" font-family="sans-serif" font-size="0.32" fill="#fff">Peak phase skew magnitude (mm): ${formattedPeakPhaseSkewsMm || "no measurable pairs"}. Blue: ahead. Red: behind. White: in step. Grey: unknown.</text>
</svg>`
}

/** The points a route point passes through: one, or both ends of a through pad. */
function routePointPositions(routePoint: PcbTraceRoutePoint): Point[] {
  if (routePoint.route_type === "through_pad") {
    return [routePoint.start, routePoint.end]
  }
  return [{ x: routePoint.x, y: routePoint.y }]
}

/**
 * One segment as SVG lines: grey when unknown; otherwise the zero colour
 * with the sign's colour over it at the segment's share of the trace's
 * phase skew extreme for that sign.
 */
function phaseSkewLines({
  trace,
  segment,
}: {
  trace: PhaseSkewTrace
  segment: PhaseSkewSegment
}): string[] {
  const { start, end, width, phase_skew } = segment
  const line = `x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke-width="${width * OVERLAY_WIDTH_FACTOR}"`
  if (phase_skew === undefined) {
    return [`<line ${line} stroke="${DEFAULT_PHASE_SKEW_COLORS.unknown}"/>`]
  }
  let color = DEFAULT_PHASE_SKEW_COLORS.positive
  let phaseSkewExtremeMm = trace.max_phase_skew
  if (phase_skew < 0) {
    color = DEFAULT_PHASE_SKEW_COLORS.negative
    phaseSkewExtremeMm = trace.min_phase_skew
  }
  let opacity = 0
  if (phaseSkewExtremeMm !== 0) {
    opacity = Math.min(1, phase_skew / phaseSkewExtremeMm)
  }
  return [
    `<line ${line} stroke="${DEFAULT_PHASE_SKEW_COLORS.zero}"/>`,
    `<line ${line} stroke="${color}" stroke-opacity="${opacity}"/>`,
  ]
}
