import type {
  PcbTraceRoutePoint,
  PcbTraceRoutePointWire,
  Point,
} from "circuit-json"

/** A wire point's outgoing taper: its width changes from `start_width` to `end_width` along the piece it starts. */
type WireTaper = {
  start_width: number
  end_width: number
  width_interpolation_mode: NonNullable<
    PcbTraceRoutePointWire["width_interpolation_mode"]
  >
}

/** Where one piece of a cut taper starts and how wide it is, in mm. */
type TaperPiece = { start: Point; width: number }

/** Tapers are cut into pieces whose widths differ by at most this, in mm, so each piece is matched and drawn at its local width. */
const TAPER_WIDTH_STEP_MM = 0.01

/**
 * The route with each wire point's taper, such as a teardrop, cut into
 * plain wire points every {@link TAPER_WIDTH_STEP_MM} mm of width change,
 * each as wide as the taper midway through its piece's change. Quadratic
 * tapers are flat at their narrow end, as the copper renderers draw them.
 * Clipping routing inside pads and walking the route then see copper at
 * its local width wherever a taper is cut.
 */
export function cutRouteTapers({
  route,
}: {
  route: PcbTraceRoutePoint[]
}): PcbTraceRoutePoint[] {
  const cutRoute: PcbTraceRoutePoint[] = []
  for (const [index, routePoint] of route.entries()) {
    const next = route[index + 1]
    if (routePoint.route_type !== "wire" || next === undefined) {
      cutRoute.push(routePoint)
      continue
    }
    const taper = getWireTaper(routePoint)
    if (taper === null) {
      cutRoute.push(routePoint)
      continue
    }
    const {
      start_width: _startWidth,
      end_width: _endWidth,
      width_interpolation_mode: _widthInterpolationMode,
      ...plainWire
    } = routePoint
    const [firstPiece, ...remainingPieces] = getTaperPieces({
      start: routePoint,
      end: getRoutePointStart(next),
      taper,
    })
    if (!firstPiece) throw new Error("A taper must contain at least one piece")
    cutRoute.push({ ...plainWire, width: firstPiece.width })
    for (const piece of remainingPieces) {
      cutRoute.push({
        route_type: "wire",
        x: piece.start.x,
        y: piece.start.y,
        layer: routePoint.layer,
        width: piece.width,
      })
    }
  }
  return cutRoute
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

/** Where the copper arriving at a route point ends: a through pad's start, or the point itself. */
function getRoutePointStart(routePoint: PcbTraceRoutePoint): Point {
  if (routePoint.route_type === "through_pad") return routePoint.start
  return { x: routePoint.x, y: routePoint.y }
}

/**
 * The pieces of a taper from `start` to `end`, cut every
 * {@link TAPER_WIDTH_STEP_MM} mm of width change, each as wide as the
 * taper midway through its change.
 */
function getTaperPieces({
  start,
  end,
  taper,
}: {
  start: Point
  end: Point
  taper: WireTaper
}): TaperPiece[] {
  const widthChange = taper.end_width - taper.start_width
  const pieceCount = Math.max(
    1,
    Math.ceil(Math.abs(widthChange) / TAPER_WIDTH_STEP_MM),
  )
  const pieces: TaperPiece[] = []
  for (let piece = 0; piece < pieceCount; piece++) {
    const startFraction = getTaperDistanceFraction({
      taper,
      widthChangeFraction: piece / pieceCount,
    })
    pieces.push({
      start: {
        x: start.x + (end.x - start.x) * startFraction,
        y: start.y + (end.y - start.y) * startFraction,
      },
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
