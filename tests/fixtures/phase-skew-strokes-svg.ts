import "bun-match-svg"
import { cju } from "@tscircuit/circuit-json-util"
import type { AnyCircuitElement, LayerRef } from "circuit-json"
import type { PhaseSkewStroke } from "lib/index"

/** SVG pixels per PCB millimetre. */
const PIXELS_PER_MM = 32

/** Copper colours for the two layers of the demo boards. */
const COPPER_COLORS = { top: "#bb794e", bottom: "#7477aa" }

/** Draws the same demo board with the overlay off and on. */
export function phaseSkewStrokesSvg({
  circuitJson,
  strokes,
  caption,
}: {
  circuitJson: AnyCircuitElement[]
  strokes: PhaseSkewStroke[]
  caption: string
}): string {
  const db = cju(circuitJson)
  const { width: boardWidth, height: boardHeight } = db.pcb_board.list()[0]
  if (boardWidth === undefined || boardHeight === undefined) {
    throw new Error("The demo board must have an explicit size")
  }
  const panelHeight = boardHeight + 1.2
  const copper = db.pcb_trace.list().flatMap(({ pcb_trace_id, route }) =>
    route.flatMap<PhaseSkewStroke>((end, index) => {
      const start = route[index - 1]
      if (
        start === undefined ||
        start.route_type === "through_pad" ||
        end.route_type === "through_pad"
      )
        return []

      let layer: LayerRef
      let endLayer: LayerRef
      if (start.route_type === "wire") layer = start.layer
      else layer = start.to_layer
      if (end.route_type === "wire") endLayer = end.layer
      else endLayer = end.from_layer
      if (layer !== endLayer || (layer !== "top" && layer !== "bottom")) {
        return []
      }
      const color = COPPER_COLORS[layer]
      if (start.route_type === "wire") {
        return [{ pcb_trace_id, layer, start, end, width: start.width, color }]
      }
      if (end.route_type === "wire") {
        return [{ pcb_trace_id, layer, start, end, width: end.width, color }]
      }
      return []
    }),
  )
  const pads = db.pcb_smtpad.list()
  const vias = db.pcb_via.list()
  const viaRings = vias.map(
    (via) =>
      `<circle cx="${via.x}" cy="${via.y}" r="${via.outer_diameter / 2}" fill="#a58f78"/>`,
  )
  const drills = vias.map(
    (via) =>
      `<circle cx="${via.x}" cy="${via.y}" r="${via.hole_diameter / 2}" fill="#0f1516"/>`,
  )
  const silkscreen = db.pcb_silkscreen_text
    .list()
    .filter((text) => text.pcb_component_id === undefined)
    .map(
      (text) =>
        `        <text x="${text.anchor_position.x}" y="${-text.anchor_position.y}" text-anchor="middle" font-size="${text.font_size}" fill="#e6e8e5">${text.text}</text>\n`,
    )
    .join("")
  const panels = [
    { label: "Before · Copper", overlay: [] },
    { label: "After · Phase skew", overlay: strokes },
  ].map(({ label, overlay }, index) => {
    const layers = (["bottom", "top"] as const).flatMap((layer) => [
      ...pads.flatMap((pad) => {
        if (pad.layer !== layer || pad.shape !== "circle") return []
        return [
          `<circle cx="${pad.x}" cy="${pad.y}" r="${pad.radius}" fill="${COPPER_COLORS[layer]}"/>`,
        ]
      }),
      ...copper.filter((stroke) => stroke.layer === layer).map(strokeLine),
      ...viaRings,
      ...overlay.filter((stroke) => stroke.layer === layer).map(strokeLine),
    ])
    return `<g transform="translate(0 ${panelHeight * index})">
      <rect y="1.2" width="${boardWidth}" height="${boardHeight}" fill="#20332f"/>
      <text x="0.5" y="0.86" font-size="0.47" fill="#f6f9f8">${label}</text>
      <g transform="translate(${boardWidth / 2} ${1.2 + boardHeight / 2})">
${silkscreen}        <g transform="scale(1 -1)" stroke-linecap="round">
          ${[...layers, ...drills].join("\n          ")}
        </g>
      </g>
    </g>`
  })
  const height = 1.5 + panelHeight * panels.length
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${boardWidth * PIXELS_PER_MM}" height="${height * PIXELS_PER_MM}" viewBox="0 0 ${boardWidth} ${height}" font-family="sans-serif">
    <rect width="${boardWidth}" height="${height}" fill="#182124"/>
    <text x="0.5" y="0.95" font-size="0.62" font-weight="bold" fill="#f6f9f8">${caption}</text>
    <g transform="translate(0 1.5)">
      ${panels.join("\n      ")}
    </g>
  </svg>`
}

/** Renders the stroke geometry and colour from the public API. */
function strokeLine({ start, end, width, color }: PhaseSkewStroke): string {
  return `<line x1="${start.x.toFixed(4)}" y1="${start.y.toFixed(4)}" x2="${end.x.toFixed(4)}" y2="${end.y.toFixed(4)}" stroke-width="${width}" stroke="${color}"/>`
}
