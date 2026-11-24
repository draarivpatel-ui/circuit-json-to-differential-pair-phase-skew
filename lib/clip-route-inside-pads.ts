import type { CircuitJsonUtilObjects } from "@tscircuit/circuit-json-util"
import type {
  LayerRef,
  PcbPort,
  PcbTrace,
  PcbTraceRoutePoint,
  PcbTraceRoutePointVia,
  PcbTraceRoutePointWire,
  Point,
} from "circuit-json"
import {
  getCircleOutline,
  getPadOutlineExitPoint,
  getPlatedHoleOutline,
  getSmtPadOutline,
  type PadOutline,
} from "./get-pad-outline"

/**
 * How the routing at one end of a run is clipped to a pad: the end point is
 * kept, then `insertedWire` (a wire point moved to the pad's edge, or null
 * when the route goes straight on to a via inside the pad), then the route
 * from `keptIndex` away from that end.
 */
type PadClip = {
  keptIndex: number
  insertedWire: PcbTraceRoutePointWire | null
}

/** Routing inside a pad no longer than a straight line plus this, in mm, is already straight: rounding, not a jog. */
const STRAIGHT_PATH_TOLERANCE_MM = 1e-9

/**
 * The route with the copper inside its pads replaced by a straight line from
 * the pad's centre to where the route first leaves the pad, as KiCad's
 * tuning path clips routing inside pads (`OptimiseTraceInPad`) and vias
 * (`OptimiseTraceInVia`). A jog hidden inside a pad, inside its drill, or
 * inside a via's pad so adds no phase skew, and every via keeps its layer
 * change. Cut tapers first, so a wire point moved to a pad's edge keeps the
 * taper's width there.
 */
export function clipRouteInsidePads({
  route,
  db,
  pcbTraceId,
}: {
  route: PcbTraceRoutePoint[]
  db: CircuitJsonUtilObjects
  pcbTraceId: PcbTrace["pcb_trace_id"]
}): PcbTraceRoutePoint[] {
  return clipRouteToViaPads({
    route: clipRouteToTerminalPads({ route, db }),
    db,
    pcbTraceId,
  })
}

/**
 * The route clipped inside the pads of its end ports on the end points'
 * layers, measured by their outer copper outline. When the route stays
 * inside the pad up to a via, it runs straight to the via. When the
 * straight line would leave the pad's copper, across a concave pad's
 * notch, the routing inside the pad is kept as drawn.
 */
function clipRouteToTerminalPads({
  route,
  db,
}: {
  route: PcbTraceRoutePoint[]
  db: CircuitJsonUtilObjects
}): PcbTraceRoutePoint[] {
  const first = route[0]
  let clippedRoute = route
  if (first?.route_type === "wire") {
    clippedRoute = applyPadClip({
      route,
      endIndex: 0,
      direction: 1,
      padClip: findPadClip({
        route,
        endIndex: 0,
        direction: 1,
        padOutline: getPortPadOutline({
          db,
          pcbPortId: first.start_pcb_port_id,
          layer: first.layer,
        }),
      }),
    })
  }
  const last = clippedRoute[clippedRoute.length - 1]
  if (last?.route_type !== "wire") return clippedRoute
  const endIndex = clippedRoute.length - 1
  return applyPadClip({
    route: clippedRoute,
    endIndex,
    direction: -1,
    padClip: findPadClip({
      route: clippedRoute,
      endIndex,
      direction: -1,
      padOutline: getPortPadOutline({
        db,
        pcbPortId: last.end_pcb_port_id,
        layer: last.layer,
      }),
    }),
  })
}

/**
 * The route clipped inside the round pad of each via whose outer diameter
 * is known, on both sides: the wire points inside the via's pad go, and
 * the route runs straight from where it enters the pad to the via centre.
 */
function clipRouteToViaPads({
  route,
  db,
  pcbTraceId,
}: {
  route: PcbTraceRoutePoint[]
  db: CircuitJsonUtilObjects
  pcbTraceId: PcbTrace["pcb_trace_id"]
}): PcbTraceRoutePoint[] {
  let clippedRoute = route
  // From the last via back, so clipping never moves a via still to visit.
  for (let index = route.length - 1; index >= 0; index--) {
    const via = clippedRoute[index]
    if (via?.route_type !== "via") continue
    const padOutline = getViaPadOutline({ db, pcbTraceId, via })
    clippedRoute = applyPadClip({
      route: clippedRoute,
      endIndex: index,
      direction: 1,
      padClip: findPadClip({
        route: clippedRoute,
        endIndex: index,
        direction: 1,
        padOutline,
      }),
    })
    const backwardClip = findPadClip({
      route: clippedRoute,
      endIndex: index,
      direction: -1,
      padOutline,
    })
    clippedRoute = applyPadClip({
      route: clippedRoute,
      endIndex: index,
      direction: -1,
      padClip: backwardClip,
    })
    // Next visit the point the backward clip kept.
    if (backwardClip !== null) index = backwardClip.keptIndex + 1
  }
  return clippedRoute
}

/** The route with a pad clip applied at `endIndex`, or the route itself without one. */
function applyPadClip({
  route,
  endIndex,
  direction,
  padClip,
}: {
  route: PcbTraceRoutePoint[]
  endIndex: number
  direction: 1 | -1
  padClip: PadClip | null
}): PcbTraceRoutePoint[] {
  if (padClip === null) return route
  const insertedWires: PcbTraceRoutePoint[] = []
  if (padClip.insertedWire !== null) insertedWires.push(padClip.insertedWire)
  if (direction === 1) {
    return route
      .slice(0, endIndex + 1)
      .concat(insertedWires, route.slice(padClip.keptIndex))
  }
  return route
    .slice(0, padClip.keptIndex + 1)
    .concat(insertedWires, route.slice(endIndex))
}

/** The outer outline of the pad of a port on a copper layer, or null when it has none there. */
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
  if (smtPad !== undefined) return getSmtPadOutline(smtPad)
  const platedHole = db.pcb_plated_hole
    .list({ pcb_port_id: pcbPortId })
    .find((hole) => hole.layers.includes(layer))
  if (platedHole === undefined) return null
  let componentCcwRotationDegrees = 0
  if (platedHole.pcb_component_id !== undefined) {
    componentCcwRotationDegrees =
      db.pcb_component.get(platedHole.pcb_component_id)?.rotation ?? 0
  }
  return getPlatedHoleOutline({ platedHole, componentCcwRotationDegrees })
}

/**
 * A via's round pad, from the route point's outer diameter or the trace's
 * `pcb_via` at the same point, or null when neither gives it.
 */
function getViaPadOutline({
  db,
  pcbTraceId,
  via,
}: {
  db: CircuitJsonUtilObjects
  pcbTraceId: PcbTrace["pcb_trace_id"]
  via: PcbTraceRoutePointVia
}): PadOutline | null {
  let outerDiameterMm = via.outer_diameter
  if (outerDiameterMm === undefined) {
    outerDiameterMm = db.pcb_via
      .list({ pcb_trace_id: pcbTraceId })
      .find(
        (pcbVia) => pcbVia.x === via.x && pcbVia.y === via.y,
      )?.outer_diameter
  }
  if (outerDiameterMm === undefined) return null
  return getCircleOutline({ center: via, diameterMm: outerDiameterMm })
}

/**
 * Walks from a route point in a pad (a terminal wire point or a via)
 * through the wire points of one layer and finds where the route first
 * leaves the pad, or the via it reaches while still inside. Null when there
 * is no pad or nothing to clip: the route already runs straight from the
 * pad's point to where it leaves the pad or to the via, as a teardrop does,
 * or a straight line there would cross a gap in a concave pad, so its
 * points and widths are kept.
 */
function findPadClip({
  route,
  endIndex,
  direction,
  padOutline,
}: {
  route: PcbTraceRoutePoint[]
  /** The route point in the pad: a terminal wire point or a via. */
  endIndex: number
  /** 1 to walk towards the end of the route, -1 towards its start. */
  direction: 1 | -1
  padOutline: PadOutline | null
}): PadClip | null {
  if (padOutline === null) return null
  const endPoint = route[endIndex]
  if (!endPoint || endPoint.route_type === "through_pad") return null
  const endPosition = { x: endPoint.x, y: endPoint.y }
  let runLayer: LayerRef | null = null
  if (endPoint.route_type === "wire") runLayer = endPoint.layer
  let lastInsideWire: PcbTraceRoutePointWire | null = null
  let lastInsidePosition = endPosition
  let insidePathLengthMm = 0
  for (
    let index = endIndex + direction;
    index >= 0 && index < route.length;
    index += direction
  ) {
    const routePoint = route[index]
    if (!routePoint || routePoint.route_type === "through_pad") return null
    if (routePoint.route_type === "wire") {
      if (runLayer === null) runLayer = routePoint.layer
      if (routePoint.layer !== runLayer) return null
    }
    const position = { x: routePoint.x, y: routePoint.y }
    const exitPoint = getPadOutlineExitPoint({
      padOutline,
      start: lastInsidePosition,
      end: position,
    })
    if (exitPoint === null && routePoint.route_type === "wire") {
      insidePathLengthMm += distance({ a: lastInsidePosition, b: position })
      lastInsideWire = routePoint
      lastInsidePosition = position
      continue
    }
    // Nothing inside the pad beyond its point: the route leaves straight.
    if (lastInsideWire === null) return null
    const pathEnd = exitPoint ?? position
    if (
      keepsInPadRouting({
        padOutline,
        endPosition,
        lastInsidePosition,
        insidePathLengthMm,
        pathEnd,
      })
    ) {
      return null
    }
    if (exitPoint === null) return { keptIndex: index, insertedWire: null }
    return {
      keptIndex: index,
      insertedWire: { ...lastInsideWire, ...exitPoint },
    }
  }
  return null
}

/**
 * True when the routing inside the pad, from the pad's point through the
 * route's points inside the pad on to `pathEnd`, stays as drawn: it is
 * already a straight line, so clipping would change nothing, or a straight
 * line to `pathEnd` would leave the pad's copper, as across a concave pad's
 * notch.
 */
function keepsInPadRouting({
  padOutline,
  endPosition,
  lastInsidePosition,
  insidePathLengthMm,
  pathEnd,
}: {
  padOutline: PadOutline
  endPosition: Point
  lastInsidePosition: Point
  /** Routed length from `endPosition` to `lastInsidePosition`, in mm. */
  insidePathLengthMm: number
  pathEnd: Point
}): boolean {
  const pathLengthMm =
    insidePathLengthMm + distance({ a: lastInsidePosition, b: pathEnd })
  if (
    pathLengthMm - distance({ a: endPosition, b: pathEnd }) <=
    STRAIGHT_PATH_TOLERANCE_MM
  ) {
    return true
  }
  return (
    getPadOutlineExitPoint({
      padOutline,
      start: endPosition,
      end: pathEnd,
    }) !== null
  )
}

/** Straight-line distance between two points, in mm. */
function distance({ a, b }: { a: Point; b: Point }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
