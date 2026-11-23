import type { CircuitJsonUtilObjects } from "@tscircuit/circuit-json-util"
import type {
  LayerRef,
  PcbPort,
  PcbTraceRoutePoint,
  PcbTraceRoutePointWire,
  Point,
} from "circuit-json"
import {
  getPadOutlineExitPoint,
  getPlatedHoleOutline,
  getSmtPadOutline,
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

/** Routing inside a pad no longer than a straight line plus this, in mm, is already straight: rounding, not a jog. */
const STRAIGHT_PATH_TOLERANCE_MM = 1e-9

/**
 * The route with the copper inside its start and end pads replaced by a
 * straight line from the route's end to where it first leaves the pad, as
 * KiCad's tuning path clips routing inside pads (`OptimiseTraceInPad`). A
 * jog hidden inside a pad, or inside its drill, so adds no phase skew. When
 * the route stays inside the pad up to a via, it runs straight to the via,
 * which keeps its layer change. Pads are the end ports' pads on the end
 * point's layer, measured by their outer copper outline. Cut tapers
 * first, so the wire point moved to a pad's edge keeps the taper's width
 * there.
 */
export function clipRouteToTerminalPads({
  route,
  db,
}: {
  route: PcbTraceRoutePoint[]
  db: CircuitJsonUtilObjects
}): PcbTraceRoutePoint[] {
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
 * route already runs straight from its end to where it leaves the pad or
 * to the via, as a teardrop does, so its points and widths are kept.
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
  let insidePathLengthMm = 0
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
    const exitPoint = getPadOutlineExitPoint({
      padOutline,
      start: lastInsideWire,
      end: position,
    })
    if (exitPoint === null) {
      if (routePoint.route_type === "wire") {
        insidePathLengthMm += distance({ a: lastInsideWire, b: position })
        lastInsideWire = routePoint
        continue
      }
      if (
        isStraightPath({
          endWire,
          lastInsideWire,
          insidePathLengthMm,
          pathEnd: position,
        })
      ) {
        return null
      }
      return { keptIndex: index, insertedWire: null }
    }
    if (
      isStraightPath({
        endWire,
        lastInsideWire,
        insidePathLengthMm,
        pathEnd: exitPoint,
      })
    ) {
      return null
    }
    return {
      keptIndex: index,
      insertedWire: { ...lastInsideWire, ...exitPoint },
    }
  }
  return null
}

/**
 * True when the route from the end in the pad, through its points inside
 * the pad, on to `pathEnd` is a straight line, so clipping would change
 * nothing.
 */
function isStraightPath({
  endWire,
  lastInsideWire,
  insidePathLengthMm,
  pathEnd,
}: {
  endWire: Point
  lastInsideWire: Point
  /** Routed length from `endWire` to `lastInsideWire`, in mm. */
  insidePathLengthMm: number
  pathEnd: Point
}): boolean {
  const pathLengthMm =
    insidePathLengthMm + distance({ a: lastInsideWire, b: pathEnd })
  return (
    pathLengthMm - distance({ a: endWire, b: pathEnd }) <=
    STRAIGHT_PATH_TOLERANCE_MM
  )
}

/** Straight-line distance between two points, in mm. */
function distance({ a, b }: { a: Point; b: Point }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
