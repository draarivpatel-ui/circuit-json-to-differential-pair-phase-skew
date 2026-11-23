import {
  type CircuitJsonUtilObjects,
  getPlatedHolePolygon,
  getSmtPadPolygon,
} from "@tscircuit/circuit-json-util"
import type {
  LayerRef,
  PcbPort,
  PcbTrace,
  PcbTraceRoutePoint,
  PcbTraceRoutePointWire,
  Point,
} from "circuit-json"

/** A pad's copper outline, as circuit-json-util builds it. */
type PadOutline = ReturnType<typeof getSmtPadPolygon>

/**
 * Where a route first leaves a pad: the index of the last route point inside
 * it, and that wire point moved to the pad's edge.
 */
type PadExit = { lastInsideIndex: number; exitWire: PcbTraceRoutePointWire }

/** Halvings of the segment that crosses a pad's edge; 40 locate the edge to under a picometre on any board. */
const PAD_EXIT_BISECTION_STEPS = 40

/**
 * The trace's route with the copper inside its start and end pads replaced
 * by a straight line from the route's end to where it first leaves the pad,
 * as KiCad's tuning path clips routing inside pads (`OptimiseTraceInPad`).
 * A jog hidden inside a pad so adds no phase skew. Only the wire points on
 * the end point's layer before the first via are clipped, against the pad
 * of the end's port on that layer.
 */
export function clipRouteToTerminalPads({
  trace,
  db,
}: {
  trace: PcbTrace
  db: CircuitJsonUtilObjects
}): PcbTraceRoutePoint[] {
  const route = trace.route
  const first = route[0]
  const last = route[route.length - 1]
  let clippedRoute = route
  if (first?.route_type === "wire") {
    const startExit = findPadExit({
      route,
      endWire: first,
      endIndex: 0,
      direction: 1,
      padOutline: getPortPadOutline({
        db,
        pcbPortId: first.start_pcb_port_id,
        layer: first.layer,
      }),
    })
    if (startExit !== null) {
      clippedRoute = [
        first,
        startExit.exitWire,
        ...route.slice(startExit.lastInsideIndex + 1),
      ]
    }
  }
  if (last?.route_type !== "wire") return clippedRoute
  const endExit = findPadExit({
    route: clippedRoute,
    endWire: last,
    endIndex: clippedRoute.length - 1,
    direction: -1,
    padOutline: getPortPadOutline({
      db,
      pcbPortId: last.end_pcb_port_id,
      layer: last.layer,
    }),
  })
  if (endExit === null) return clippedRoute
  return [
    ...clippedRoute.slice(0, endExit.lastInsideIndex),
    endExit.exitWire,
    last,
  ]
}

/** The outline of the pad of a port on a copper layer, or null when it has none there. */
function getPortPadOutline({
  db,
  pcbPortId,
  layer,
}: {
  db: CircuitJsonUtilObjects
  pcbPortId: PcbPort["pcb_port_id"] | undefined
  layer: LayerRef
}): PadOutline | null {
  if (pcbPortId === undefined) return null
  const smtPad = db.pcb_smtpad
    .list({ pcb_port_id: pcbPortId })
    .find((pad) => pad.layer === layer)
  if (smtPad !== undefined) return getSmtPadPolygon(smtPad)
  const platedHole = db.pcb_plated_hole
    .list({ pcb_port_id: pcbPortId })
    .find((hole) => hole.layers.includes(layer))
  if (platedHole !== undefined) return getPlatedHolePolygon(platedHole)
  return null
}

/**
 * Walks from one end of the route through the wire points on that end's
 * layer, up to the first via or layer change, and finds where it first
 * leaves the pad. Null when there is no pad or no route point inside it to
 * clip.
 */
function findPadExit({
  route,
  endWire,
  endIndex,
  direction,
  padOutline,
}: {
  route: PcbTraceRoutePoint[]
  /** The wire point at `endIndex`, where the route ends in the pad. */
  endWire: PcbTraceRoutePointWire
  endIndex: number
  /** 1 to walk from the start of the route, -1 from its end. */
  direction: 1 | -1
  padOutline: PadOutline | null
}): PadExit | null {
  if (padOutline === null) return null
  let lastInsideWire = endWire
  for (
    let index = endIndex + direction;
    index >= 0 && index < route.length;
    index += direction
  ) {
    const routePoint = route[index]
    if (routePoint.route_type !== "wire") return null
    if (routePoint.layer !== endWire.layer) return null
    if (isInsidePad({ padOutline, point: routePoint })) {
      lastInsideWire = routePoint
      continue
    }
    const lastInsideIndex = index - direction
    if (lastInsideIndex === endIndex) return null
    return {
      lastInsideIndex,
      exitWire: {
        ...lastInsideWire,
        ...getPadExitPoint({
          padOutline,
          inside: lastInsideWire,
          outside: routePoint,
        }),
      },
    }
  }
  return null
}

/** The point where the segment from a point inside a pad to one outside it crosses the pad's edge (bisection). */
function getPadExitPoint({
  padOutline,
  inside,
  outside,
}: {
  padOutline: PadOutline
  inside: Point
  outside: Point
}): Point {
  let insideFraction = 0
  let outsideFraction = 1
  for (let step = 0; step < PAD_EXIT_BISECTION_STEPS; step++) {
    const middleFraction = (insideFraction + outsideFraction) / 2
    const middle = pointAlong({ inside, outside, fraction: middleFraction })
    if (isInsidePad({ padOutline, point: middle })) {
      insideFraction = middleFraction
      continue
    }
    outsideFraction = middleFraction
  }
  return pointAlong({ inside, outside, fraction: insideFraction })
}

/**
 * True when a point lies inside or on the edge of a pad's copper outline.
 * The outline only tests points of its own flatten-js class, so the point is
 * made by moving the outline's own bounding box centre.
 */
function isInsidePad({
  padOutline,
  point,
}: {
  padOutline: PadOutline
  point: Point
}): boolean {
  const { center } = padOutline.box
  return padOutline.contains(
    center.translate(point.x - center.x, point.y - center.y),
  )
}

/** The point a fraction of the way from `inside` to `outside`. */
function pointAlong({
  inside,
  outside,
  fraction,
}: {
  inside: Point
  outside: Point
  fraction: number
}): Point {
  return {
    x: inside.x + (outside.x - inside.x) * fraction,
    y: inside.y + (outside.y - inside.y) * fraction,
  }
}
