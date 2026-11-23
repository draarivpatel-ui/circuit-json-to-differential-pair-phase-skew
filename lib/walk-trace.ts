import type {
  LayerRef,
  PcbTraceRoutePoint,
  PcbTraceRoutePointWire,
  Point,
} from "circuit-json"
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
  /** Z-distance of any layer changes (vias or through pads) directly before `start`, in mm. */
  layerChangeLengthBeforeMm: number
  /** Z-distance of any layer changes directly after `end`, in mm. */
  layerChangeLengthAfterMm: number
}

/** A trace's steps in walk order, and its total length including vias, in mm. */
export type TraceWalk = {
  steps: TraceStep[]
  length: number
}

/**
 * A point the route passes through and the layers copper joins there: one
 * for a wire point, or the two layers a via, or a through pad's far end,
 * joins. A via has no width of its own.
 */
type TraceRouteVertex = {
  point: Point
  /** One or two copper layers. */
  layers: LayerRef[]
  width: number | undefined
  /** How a wire point's outgoing piece tapers, or null when it keeps `width`. */
  taper: WireTaper | null
}

/** A wire point's outgoing taper: its width changes from `start_width` to `end_width` along the piece it starts. */
type WireTaper = {
  start_width: number
  end_width: number
  width_interpolation_mode: NonNullable<
    PcbTraceRoutePointWire["width_interpolation_mode"]
  >
}

/** A straight piece of copper and its width, in mm. */
type CopperPiece = { start: Point; end: Point; width: number }

/** Tapers are cut into pieces whose widths differ by at most this, in mm, so each piece is matched and drawn at its local width. */
const TAPER_WIDTH_STEP_MM = 0.01

/**
 * Splits a trace's route into straight pieces in stored route order, with
 * the copper renderers' layer rules: copper runs between consecutive wire
 * points on the same layer, between a wire point and a via on one of the
 * via's layers, and across a through pad. Copper arriving at a via, or at a
 * through pad's far end, on one of its two layers leaves on the other,
 * adding their Z-distance through the board's stackup. Two vias in a row,
 * as core routes a `pcbPath` between vias, are joined on the layer they
 * share. Each piece is as wide as its start point, or its end point when it
 * starts at a via; a piece from one via to the next keeps the previous
 * piece's width. A wire point's taper, such as a teardrop, is cut into
 * pieces each as wide as the taper midway through its width change.
 *
 * Consecutive pieces that continue in a straight line on the same copper
 * are joined, so how finely a route is split into points doesn't matter.
 *
 * Null when there is nothing to measure phase skew along: the route has no
 * planar copper, such as a via in pad joining two pads at the same point,
 * or its copper isn't continuous, such as two wire points on different
 * layers with no via between them.
 */
export function walkTrace({
  route,
  pcbStackup,
  boardThickness,
}: { route: PcbTraceRoutePoint[] } & LayerChangeBoard): TraceWalk | null {
  const walk = getTraceWalkFromVertices({
    vertices: getTraceRouteVertices({ route }),
    pcbStackup,
    boardThickness,
  })
  if (walk === null || walk.steps.length === 0) return null
  return {
    steps: joinStraightSteps({ steps: walk.steps }),
    length: walk.length,
  }
}

/**
 * One step from each route vertex to the next, skipping zero-length ones,
 * with layer change lengths at their ends. Null where the copper isn't
 * continuous.
 */
function getTraceWalkFromVertices({
  vertices,
  pcbStackup,
  boardThickness,
}: { vertices: TraceRouteVertex[] } & LayerChangeBoard): TraceWalk | null {
  const steps: TraceStep[] = []
  let distance = 0
  let pendingLayerChangeLengthMm = 0
  let layer: LayerRef | undefined
  for (let index = 0; index < vertices.length; index++) {
    const from = vertices[index - 1]
    const to = vertices[index]
    const arrivingLayer = layer ?? to.layers[0]
    if (!to.layers.includes(arrivingLayer)) return null
    if (from !== undefined) {
      const length = Math.hypot(
        to.point.x - from.point.x,
        to.point.y - from.point.y,
      )
      if (length > 0) {
        const width = from.width ?? to.width ?? steps[steps.length - 1]?.width
        if (width === undefined) return null
        for (const piece of getTaperedPieces({
          start: from.point,
          end: to.point,
          width,
          taper: from.taper,
        })) {
          const pieceLength = Math.hypot(
            piece.end.x - piece.start.x,
            piece.end.y - piece.start.y,
          )
          steps.push({
            ...piece,
            layer: arrivingLayer,
            startDistance: distance,
            length: pieceLength,
            layerChangeLengthBeforeMm: pendingLayerChangeLengthMm,
            layerChangeLengthAfterMm: 0,
          })
          pendingLayerChangeLengthMm = 0
          distance += pieceLength
        }
      }
    }
    layer = getDepartingLayer({ vertex: to, arrivingLayer })
    const layerChangeLengthMm = getLayerChangeLength({
      fromLayer: arrivingLayer,
      toLayer: layer,
      pcbStackup,
      boardThickness,
    })
    if (layerChangeLengthMm === 0) continue
    distance += layerChangeLengthMm
    pendingLayerChangeLengthMm += layerChangeLengthMm
    const previous = steps[steps.length - 1]
    if (previous === undefined) continue
    steps[steps.length - 1] = {
      ...previous,
      layerChangeLengthAfterMm:
        previous.layerChangeLengthAfterMm + layerChangeLengthMm,
    }
  }
  return { steps, length: distance }
}

/**
 * The piece from `start` to `end` as copper pieces: whole at `width`
 * without a taper, else cut every {@link TAPER_WIDTH_STEP_MM} mm of width
 * change, each piece as wide as the taper midway through its change.
 */
function getTaperedPieces({
  start,
  end,
  width,
  taper,
}: CopperPiece & { taper: WireTaper | null }): CopperPiece[] {
  if (taper === null) return [{ start, end, width }]
  const widthChange = taper.end_width - taper.start_width
  const pieceCount = Math.max(
    1,
    Math.ceil(Math.abs(widthChange) / TAPER_WIDTH_STEP_MM),
  )
  const pieces: CopperPiece[] = []
  for (let piece = 0; piece < pieceCount; piece++) {
    const startFraction = getTaperDistanceFraction({
      taper,
      widthChangeFraction: piece / pieceCount,
    })
    const endFraction = getTaperDistanceFraction({
      taper,
      widthChangeFraction: (piece + 1) / pieceCount,
    })
    pieces.push({
      start: pointAlong({ start, end, fraction: startFraction }),
      end: pointAlong({ start, end, fraction: endFraction }),
      width: taper.start_width + (widthChange * (piece + 0.5)) / pieceCount,
    })
  }
  return pieces
}

/**
 * How far along a taper, as a fraction of its length, its width has made
 * `widthChangeFraction` of its change. A quadratic taper is flat at its
 * narrow end, as the copper renderers draw it: there the width grows with
 * the square of the distance.
 */
function getTaperDistanceFraction({
  taper,
  widthChangeFraction,
}: {
  taper: WireTaper
  widthChangeFraction: number
}): number {
  if (taper.width_interpolation_mode === "linear") return widthChangeFraction
  if (taper.start_width <= taper.end_width) {
    return Math.sqrt(widthChangeFraction)
  }
  return 1 - Math.sqrt(1 - widthChangeFraction)
}

/** The point a fraction of the way from `start` to `end`. */
function pointAlong({
  start,
  end,
  fraction,
}: {
  start: Point
  end: Point
  fraction: number
}): Point {
  return {
    x: start.x + (end.x - start.x) * fraction,
    y: start.y + (end.y - start.y) * fraction,
  }
}

/** The layer copper leaves a vertex on: a wire point's own layer, or the other of the two layers a via joins. */
function getDepartingLayer({
  vertex,
  arrivingLayer,
}: {
  vertex: TraceRouteVertex
  arrivingLayer: LayerRef
}): LayerRef {
  if (vertex.layers.length === 1) return vertex.layers[0]
  if (vertex.layers[0] === arrivingLayer) return vertex.layers[1]
  return vertex.layers[0]
}

/** The steps with each one that carries straight on from the one before, with no via between, joined to it. */
function joinStraightSteps({ steps }: { steps: TraceStep[] }): TraceStep[] {
  const joined: TraceStep[] = []
  for (const step of steps) {
    const previous = joined[joined.length - 1]
    if (
      previous === undefined ||
      step.layerChangeLengthBeforeMm > 0 ||
      !continuesStraight({ previous, next: step })
    ) {
      joined.push(step)
      continue
    }
    joined[joined.length - 1] = {
      ...previous,
      end: step.end,
      length: previous.length + step.length,
      layerChangeLengthAfterMm: step.layerChangeLengthAfterMm,
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
        layerChangeLengthBeforeMm: step.layerChangeLengthAfterMm,
        layerChangeLengthAfterMm: step.layerChangeLengthBeforeMm,
      }))
      .reverse(),
  }
}

/** The route's points in order, each with the layers copper joins there. */
function getTraceRouteVertices({
  route,
}: {
  route: PcbTraceRoutePoint[]
}): TraceRouteVertex[] {
  const vertices: TraceRouteVertex[] = []
  for (const routePoint of route) {
    if (routePoint.route_type === "wire") {
      vertices.push({
        point: { x: routePoint.x, y: routePoint.y },
        layers: [routePoint.layer],
        width: routePoint.width,
        taper: getWireTaper(routePoint),
      })
      continue
    }
    if (routePoint.route_type === "via") {
      vertices.push({
        point: { x: routePoint.x, y: routePoint.y },
        layers: [routePoint.from_layer, routePoint.to_layer],
        width: undefined,
        taper: null,
      })
      continue
    }
    // A through-pad point is a straight run across the pad on its start
    // layer, whose far end joins its start and end layers like a via.
    vertices.push({
      point: routePoint.start,
      layers: [routePoint.start_layer],
      width: routePoint.width,
      taper: null,
    })
    vertices.push({
      point: routePoint.end,
      layers: [routePoint.start_layer, routePoint.end_layer],
      width: routePoint.width,
      taper: null,
    })
  }
  return vertices
}

/** A wire point's outgoing taper, or null when it has none. Circuit JSON sets all three taper fields or none. */
function getWireTaper(wire: PcbTraceRoutePointWire): WireTaper | null {
  const { start_width, end_width, width_interpolation_mode } = wire
  if (
    start_width === undefined ||
    end_width === undefined ||
    width_interpolation_mode === undefined
  ) {
    return null
  }
  return { start_width, end_width, width_interpolation_mode }
}
