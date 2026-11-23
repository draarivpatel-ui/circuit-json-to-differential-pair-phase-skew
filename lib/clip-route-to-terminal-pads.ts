import type { CircuitJsonUtilObjects } from "@tscircuit/circuit-json-util"
import type {
  LayerRef,
  PcbPort,
  PcbTrace,
  PcbTraceRoutePoint,
  PcbTraceRoutePointWire,
  Point,
} from "circuit-json"
import {
  getPlatedHoleOutline,
  getSmtPadOutline,
  isInsidePadOutline,
  type PadOutline,
} from "./get-pad-outline"

/**
 * How one end of a route is clipped to its pad: the end point is kept, then
 * `insertedWire` (a wire point moved to the pad's edge, or null when the
 * route goes straight on to a via inside the pad), then the route from
 * `keptIndex` away from that end.
 */
type PadClip = {
  keptIndex: number
  insertedWire: PcbTraceRoutePointWire | null
}

/** Halvings of the segment that crosses a pad's edge; 40 locate the edge to under a picometre on any board. */
const PAD_EXIT_BISECTION_STEPS = 40

/**
 * The route with the copper inside its start and end pads replaced by a
 * straight line from the route's end to where it first leaves the pad, as
 * KiCad's tuning path clips routing inside pads (`OptimiseTraceInPad`). A
 * jog hidden inside a pad, or inside its drill, so adds no phase skew. When
 * the route stays inside the pad up to a via, it runs straight to the via,
 * which keeps its layer change. Pads are the end ports' pads on the end
 * point's layer, measured by their outer copper outline.
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
    const startClip = findPadClip({
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
    if (startClip !== null) {
      const startOfRoute: PcbTraceRoutePoint[] = [first]
      if (startClip.insertedWire !== null) {
        startOfRoute.push(startClip.insertedWire)
      }
      clippedRoute = startOfRoute.concat(route.slice(startClip.keptIndex))
    }
  }
  if (last?.route_type !== "wire") return clippedRoute
  const endClip = findPadClip({
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
  if (endClip === null) return clippedRoute
  const endOfRoute = clippedRoute.slice(0, endClip.keptIndex + 1)
  if (endClip.insertedWire !== null) endOfRoute.push(endClip.insertedWire)
  endOfRoute.push(last)
  return endOfRoute
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
 * Walks from one end of the route through the wire points on that end's
 * layer and finds where it first leaves the pad, or the via it reaches
 * while still inside. Null when there is no pad or nothing to clip: the
 * route leaves the pad, or reaches the via, straight from its end.
 */
function findPadClip({
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
}): PadClip | null {
  if (padOutline === null) return null
  let lastInsideWire = endWire
  for (
    let index = endIndex + direction;
    index >= 0 && index < route.length;
    index += direction
  ) {
    const routePoint = route[index]
    if (routePoint.route_type === "through_pad") return null
    if (
      routePoint.route_type === "wire" &&
      routePoint.layer !== endWire.layer
    ) {
      return null
    }
    const position = { x: routePoint.x, y: routePoint.y }
    const isBesideEnd = index - direction === endIndex
    if (isInsidePadOutline({ padOutline, point: position })) {
      if (routePoint.route_type === "wire") {
        lastInsideWire = routePoint
        continue
      }
      if (isBesideEnd) return null
      return { keptIndex: index, insertedWire: null }
    }
    if (isBesideEnd) return null
    return {
      keptIndex: index,
      insertedWire: {
        ...lastInsideWire,
        ...getPadExitPoint({
          padOutline,
          inside: lastInsideWire,
          outside: position,
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
    if (isInsidePadOutline({ padOutline, point: middle })) {
      insideFraction = middleFraction
      continue
    }
    outsideFraction = middleFraction
  }
  return pointAlong({ inside, outside, fraction: insideFraction })
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
