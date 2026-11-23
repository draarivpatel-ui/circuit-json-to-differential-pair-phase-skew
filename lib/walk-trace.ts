import type { LayerRef, PcbTrace, Point } from "circuit-json"
import {
  type LayerChangeBoard,
  getLayerChangeLength,
} from "./get-layer-change-length"

/**
 * A straight copper piece in PCB world XY (mm, +X right, +Y up, +Z above)
 * and its starting distance along the trace.
 */
export type TraceStep = {
  start: Point
  end: Point
  layer: LayerRef
  width: number
  /** Distance along the walk from its first point to `start`, in mm. */
  startDistance: number
  length: number
  /** Length of any via directly before `start`, in mm. */
  startViaLength: number
  /** Length of any via directly after `end`, in mm. */
  endViaLength: number
}

/** A trace's steps in walk order, and its total length including vias, in mm. */
export type TraceWalk = {
  steps: TraceStep[]
  length: number
}

/** A point the route passes through, the layer of the copper arriving at it, and its own width (none for a via). */
type RouteCorner = {
  point: Point
  layer: LayerRef
  width: number | undefined
  viaLength: number
}

/**
 * Splits a trace route into straight pieces in stored route order.
 *
 * Copper arriving at a wire point uses that wire's layer; copper arriving
 * at a via uses the via's `from_layer`. Each piece is as wide as its start
 * point, or its end point when it starts at a via, as renderers draw it. A
 * piece from one via to the next keeps the previous piece's width.
 * A via, or a through pad, between two different layers adds their
 * Z-distance through the board's stackup.
 *
 * Consecutive pieces that continue in a straight line on the same copper
 * are joined, so how finely a route is split into points doesn't matter.
 */
export function walkTrace({
  trace,
  pcbStackup,
  boardThickness,
}: { trace: PcbTrace } & LayerChangeBoard): TraceWalk {
  const corners = routeCorners({ trace, pcbStackup, boardThickness })
  const { steps, length } = cornerSteps({ corners })
  return { steps: joinStraightSteps({ steps }), length }
}

/** One step from each route corner to the next, skipping zero-length ones, with via lengths at their ends. */
function cornerSteps({ corners }: { corners: RouteCorner[] }): TraceWalk {
  const steps: TraceStep[] = []
  let distance = 0
  let pendingViaLength = 0
  for (let index = 0; index < corners.length; index++) {
    const from = corners[index - 1]
    const to = corners[index]
    if (from !== undefined) {
      const length = Math.hypot(
        to.point.x - from.point.x,
        to.point.y - from.point.y,
      )
      const width = from.width ?? to.width ?? steps[steps.length - 1]?.width
      if (length > 0 && width !== undefined) {
        steps.push({
          start: from.point,
          end: to.point,
          layer: to.layer,
          width,
          startDistance: distance,
          length,
          startViaLength: pendingViaLength,
          endViaLength: 0,
        })
      }
      if (length > 0) pendingViaLength = 0
      distance += length
    }
    if (to.viaLength === 0) continue
    distance += to.viaLength
    pendingViaLength += to.viaLength
    const previous = steps[steps.length - 1]
    if (previous === undefined) continue
    steps[steps.length - 1] = {
      ...previous,
      endViaLength: previous.endViaLength + to.viaLength,
    }
  }
  return { steps, length: distance }
}

/** The steps with each one that carries straight on from the one before, with no via between, joined to it. */
function joinStraightSteps({ steps }: { steps: TraceStep[] }): TraceStep[] {
  const joined: TraceStep[] = []
  for (const step of steps) {
    const previous = joined[joined.length - 1]
    if (
      previous === undefined ||
      step.startViaLength > 0 ||
      !continuesStraight({ previous, next: step })
    ) {
      joined.push(step)
      continue
    }
    joined[joined.length - 1] = {
      ...previous,
      end: step.end,
      length: previous.length + step.length,
      endViaLength: step.endViaLength,
    }
  }
  return joined
}

/** Cosine above which two steps count as one straight line (about 0.003°). */
const STRAIGHT_COSINE = 1 - 1e-9

/** True when `next` carries on from `previous` in a straight line on the same layer and width. */
function continuesStraight({
  previous,
  next,
}: {
  previous: TraceStep
  next: TraceStep
}): boolean {
  if (previous.layer !== next.layer || previous.width !== next.width) {
    return false
  }
  const cosine =
    ((previous.end.x - previous.start.x) * (next.end.x - next.start.x) +
      (previous.end.y - previous.start.y) * (next.end.y - next.start.y)) /
    (previous.length * next.length)
  return cosine >= STRAIGHT_COSINE
}

/** The same copper walked from the other end. Each step keeps its layer and width. */
export function reverseWalk(walk: TraceWalk): TraceWalk {
  return {
    length: walk.length,
    steps: walk.steps
      .map((step) => ({
        ...step,
        start: step.end,
        end: step.start,
        startDistance: walk.length - step.startDistance - step.length,
        startViaLength: step.endViaLength,
        endViaLength: step.startViaLength,
      }))
      .reverse(),
  }
}

/** The route's points in order, each with the copper arriving at it. */
function routeCorners({
  trace,
  pcbStackup,
  boardThickness,
}: { trace: PcbTrace } & LayerChangeBoard): RouteCorner[] {
  const corners: RouteCorner[] = []
  for (const routePoint of trace.route) {
    if (routePoint.route_type === "wire") {
      corners.push({
        point: { x: routePoint.x, y: routePoint.y },
        layer: routePoint.layer,
        width: routePoint.width,
        viaLength: 0,
      })
      continue
    }
    if (routePoint.route_type === "via") {
      corners.push({
        point: { x: routePoint.x, y: routePoint.y },
        layer: routePoint.from_layer,
        width: undefined,
        viaLength: getLayerChangeLength({
          fromLayer: routePoint.from_layer,
          toLayer: routePoint.to_layer,
          pcbStackup,
          boardThickness,
        }),
      })
      continue
    }
    // A through-pad point is a straight run across the pad, which then
    // changes layers like a via when its end layer differs.
    corners.push({
      point: routePoint.start,
      layer: routePoint.start_layer,
      width: routePoint.width,
      viaLength: 0,
    })
    corners.push({
      point: routePoint.end,
      layer: routePoint.start_layer,
      width: routePoint.width,
      viaLength: getLayerChangeLength({
        fromLayer: routePoint.start_layer,
        toLayer: routePoint.end_layer,
        pcbStackup,
        boardThickness,
      }),
    })
  }
  return corners
}
