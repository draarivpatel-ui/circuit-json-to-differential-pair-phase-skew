import type { PcbPlatedHole, PcbSmtPad, Point } from "circuit-json"

/** Halvings of the segment that crosses a convex pad's edge; 40 locate the edge to under a picometre on any board. */
const PAD_EXIT_BISECTION_STEPS = 40

/** A point this close to a polygon pad's edge, in mm, is on the edge: rounding, not a gap. */
const POLYGON_EDGE_TOLERANCE_MM = 1e-9

/**
 * A pad's outer copper outline in board coordinates, drill included: a
 * rounded rectangle (a circle or pill is one with a full corner radius), an
 * ellipse (an oval plated pad, as renderers draw it) or a polygon.
 */
export type PadOutline =
  | {
      kind: "rounded_rect"
      center: Point
      widthMm: number
      heightMm: number
      cornerRadiusMm: number
      ccwRotationDegrees: number
    }
  | {
      kind: "ellipse"
      center: Point
      widthMm: number
      heightMm: number
      ccwRotationDegrees: number
    }
  | { kind: "polygon"; points: Point[] }

/** An SMT pad's outline. */
export function getSmtPadOutline(pad: PcbSmtPad): PadOutline {
  if (pad.shape === "polygon") return { kind: "polygon", points: pad.points }
  if (pad.shape === "circle") {
    return getCircleOutline({ center: pad, diameterMm: pad.radius * 2 })
  }
  const center = { x: pad.x, y: pad.y }
  if (pad.shape === "pill" || pad.shape === "rotated_pill") {
    let ccwRotationDegrees = 0
    if (pad.shape === "rotated_pill") ccwRotationDegrees = pad.ccw_rotation
    return {
      kind: "rounded_rect",
      center,
      widthMm: pad.width,
      heightMm: pad.height,
      cornerRadiusMm: pad.radius,
      ccwRotationDegrees,
    }
  }
  let ccwRotationDegrees = 0
  if (pad.shape === "rotated_rect") ccwRotationDegrees = pad.ccw_rotation
  return {
    kind: "rounded_rect",
    center,
    widthMm: pad.width,
    heightMm: pad.height,
    cornerRadiusMm: pad.corner_radius ?? pad.rect_border_radius ?? 0,
    ccwRotationDegrees,
  }
}

/**
 * A plated hole's outer copper outline, drill included, so a route inside
 * the drill counts as inside the pad. A polygon pad's outline is relative
 * to the hole and turned by its own rotation, or its component's without
 * one, as circuit-json-util places it.
 */
export function getPlatedHoleOutline({
  platedHole,
  componentCcwRotationDegrees,
}: {
  platedHole: PcbPlatedHole
  componentCcwRotationDegrees: number
}): PadOutline {
  const center = { x: platedHole.x, y: platedHole.y }
  if (platedHole.shape === "circle") {
    return getCircleOutline({ center, diameterMm: platedHole.outer_diameter })
  }
  // Oval and pill holes: the only plated holes with an outer width.
  if ("outer_width" in platedHole) {
    if (platedHole.shape === "oval") {
      return {
        kind: "ellipse",
        center,
        widthMm: platedHole.outer_width,
        heightMm: platedHole.outer_height,
        ccwRotationDegrees: platedHole.ccw_rotation,
      }
    }
    return {
      kind: "rounded_rect",
      center,
      widthMm: platedHole.outer_width,
      heightMm: platedHole.outer_height,
      cornerRadiusMm:
        Math.min(platedHole.outer_width, platedHole.outer_height) / 2,
      ccwRotationDegrees: platedHole.ccw_rotation,
    }
  }
  if (platedHole.shape === "hole_with_polygon_pad") {
    const ccwRotationDegrees =
      platedHole.ccw_rotation ?? componentCcwRotationDegrees
    return {
      kind: "polygon",
      points: platedHole.pad_outline.map((outlinePoint) => {
        const rotated = rotateCcw({
          point: outlinePoint,
          ccwRotationDegrees,
        })
        return { x: center.x + rotated.x, y: center.y + rotated.y }
      }),
    }
  }
  let ccwRotationDegrees = 0
  if (
    platedHole.shape === "circular_hole_with_rect_pad" ||
    platedHole.shape === "rotated_pill_hole_with_rect_pad"
  ) {
    ccwRotationDegrees = platedHole.rect_ccw_rotation ?? 0
  }
  return {
    kind: "rounded_rect",
    center,
    widthMm: platedHole.rect_pad_width,
    heightMm: platedHole.rect_pad_height,
    cornerRadiusMm: platedHole.rect_border_radius ?? 0,
    ccwRotationDegrees,
  }
}

/** True when a point lies inside or on the edge of a pad outline. */
function isInsidePadOutline({
  padOutline,
  point,
}: {
  padOutline: PadOutline
  point: Point
}): boolean {
  if (padOutline.kind === "polygon") {
    return isInsidePolygon({ points: padOutline.points, point })
  }
  const local = rotateCcw({
    point: {
      x: point.x - padOutline.center.x,
      y: point.y - padOutline.center.y,
    },
    ccwRotationDegrees: -padOutline.ccwRotationDegrees,
  })
  if (padOutline.kind === "ellipse") {
    return (
      (local.x / (padOutline.widthMm / 2)) ** 2 +
        (local.y / (padOutline.heightMm / 2)) ** 2 <=
      1
    )
  }
  const cornerRadiusMm = Math.min(
    padOutline.cornerRadiusMm,
    padOutline.widthMm / 2,
    padOutline.heightMm / 2,
  )
  // Distance past the rectangle the corner circles' centres span.
  const beyondX = Math.abs(local.x) - (padOutline.widthMm / 2 - cornerRadiusMm)
  const beyondY = Math.abs(local.y) - (padOutline.heightMm / 2 - cornerRadiusMm)
  return (
    Math.hypot(Math.max(beyondX, 0), Math.max(beyondY, 0)) <= cornerRadiusMm
  )
}

/**
 * Where the segment from `start`, inside a pad, to `end` first leaves the
 * pad's outline, or null when it stays inside. Rounded rectangles and
 * ellipses are convex, so such a segment leaves only if `end` is outside;
 * a polygon can be concave, so the segment can leave through a notch and
 * come back between two inside points.
 */
export function getPadOutlineExitPoint({
  padOutline,
  start,
  end,
}: {
  padOutline: PadOutline
  start: Point
  end: Point
}): Point | null {
  if (padOutline.kind === "polygon") {
    return getPolygonExitPoint({ points: padOutline.points, start, end })
  }
  if (isInsidePadOutline({ padOutline, point: end })) return null
  let insideFraction = 0
  let outsideFraction = 1
  for (let step = 0; step < PAD_EXIT_BISECTION_STEPS; step++) {
    const middleFraction = (insideFraction + outsideFraction) / 2
    const middle = pointAlong({ start, end, fraction: middleFraction })
    if (isInsidePadOutline({ padOutline, point: middle })) {
      insideFraction = middleFraction
      continue
    }
    outsideFraction = middleFraction
  }
  return pointAlong({ start, end, fraction: insideFraction })
}

/**
 * Where a segment from inside a polygon first leaves it, or null when it
 * stays inside: the first edge crossing after which the segment is outside.
 */
function getPolygonExitPoint({
  points,
  start,
  end,
}: {
  points: Point[]
  start: Point
  end: Point
}): Point | null {
  const crossingFractions = getPolygonCrossingFractions({ points, start, end })
  let previousFraction = 0
  for (const crossingFraction of [...crossingFractions, 1]) {
    const middle = pointAlong({
      start,
      end,
      fraction: (previousFraction + crossingFraction) / 2,
    })
    if (!isInsidePolygon({ points, point: middle })) {
      return pointAlong({ start, end, fraction: previousFraction })
    }
    previousFraction = crossingFraction
  }
  return null
}

/** Fractions along the segment from `start` to `end` where it crosses a polygon edge, ascending. */
function getPolygonCrossingFractions({
  points,
  start,
  end,
}: {
  points: Point[]
  start: Point
  end: Point
}): number[] {
  const segment = { x: end.x - start.x, y: end.y - start.y }
  const crossingFractions: number[] = []
  for (let index = 0; index < points.length; index++) {
    const edgeStart = points[index]
    const edgeEnd = points[(index + 1) % points.length]
    const edge = { x: edgeEnd.x - edgeStart.x, y: edgeEnd.y - edgeStart.y }
    const denominator = cross({ a: segment, b: edge })
    // A segment parallel to an edge runs along it or misses it.
    if (denominator === 0) continue
    const fromStart = { x: edgeStart.x - start.x, y: edgeStart.y - start.y }
    const segmentFraction = cross({ a: fromStart, b: edge }) / denominator
    const edgeFraction = cross({ a: fromStart, b: segment }) / denominator
    if (segmentFraction <= 0 || segmentFraction >= 1) continue
    if (edgeFraction < 0 || edgeFraction > 1) continue
    crossingFractions.push(segmentFraction)
  }
  return crossingFractions.sort((a, b) => a - b)
}

/** The z component of the cross product of two vectors in the plane. */
function cross({ a, b }: { a: Point; b: Point }): number {
  return a.x * b.y - a.y * b.x
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

/** A round outline as a rounded rectangle with a full corner radius. */
function getCircleOutline({
  center,
  diameterMm,
}: {
  center: Point
  diameterMm: number
}): PadOutline {
  return {
    kind: "rounded_rect",
    center: { x: center.x, y: center.y },
    widthMm: diameterMm,
    heightMm: diameterMm,
    cornerRadiusMm: diameterMm / 2,
    ccwRotationDegrees: 0,
  }
}

/** True when a point lies inside a polygon (even-odd rule) or on its edge. */
function isInsidePolygon({
  points,
  point,
}: {
  points: Point[]
  point: Point
}): boolean {
  if (isOnPolygonEdge({ points, point })) return true
  let inside = false
  for (let index = 0; index < points.length; index++) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    if (start.y > point.y === end.y > point.y) continue
    const crossingX =
      start.x + ((point.y - start.y) * (end.x - start.x)) / (end.y - start.y)
    if (point.x <= crossingX) inside = !inside
  }
  return inside
}

/**
 * True when a point lies on one of a polygon's edges. The even-odd rule
 * alone counts points on some edges as inside and on others as outside.
 */
function isOnPolygonEdge({
  points,
  point,
}: {
  points: Point[]
  point: Point
}): boolean {
  for (let index = 0; index < points.length; index++) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    const edge = { x: end.x - start.x, y: end.y - start.y }
    const fromStart = { x: point.x - start.x, y: point.y - start.y }
    const edgeLength = Math.hypot(edge.x, edge.y)
    const along = (fromStart.x * edge.x + fromStart.y * edge.y) / edgeLength
    if (along < -POLYGON_EDGE_TOLERANCE_MM) continue
    if (along > edgeLength + POLYGON_EDGE_TOLERANCE_MM) continue
    const across = Math.abs(cross({ a: edge, b: fromStart })) / edgeLength
    if (across <= POLYGON_EDGE_TOLERANCE_MM) return true
  }
  return false
}

/** A point turned counter-clockwise about the origin. */
function rotateCcw({
  point,
  ccwRotationDegrees,
}: {
  point: Point
  ccwRotationDegrees: number
}): Point {
  const angle = (ccwRotationDegrees * Math.PI) / 180
  return {
    x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
  }
}
