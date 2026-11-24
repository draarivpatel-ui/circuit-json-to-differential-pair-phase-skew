/** Overlaps shorter than this, in mm, are rounding noise at shared corners. */
export const MIN_OVERLAP = 1e-6

/**
 * Corner tolerance when chaining runs in route order, in mm: half
 * {@link MIN_OVERLAP}, so every run is strictly longer than the tolerance
 * and can never precede itself or an earlier-started run.
 */
const CHAIN_TOLERANCE = MIN_OVERLAP / 2

/**
 * A stretch where the two traces of a pair run side by side. Distances are
 * routed distances along each walk from its first point, in mm.
 */
export type CoupledRun = {
  positiveStartDistanceMm: number
  positiveEndDistanceMm: number
  negativeStartDistanceMm: number
  negativeEndDistanceMm: number
}

/** A coupled run before selection, with how far apart its traces are. */
export type CandidateRun = CoupledRun & {
  /** Unsigned centreline spacing between the traces at the middle of the run, in mm. */
  midpointCenterlineSpacingMm: number
}

/** A stretch of distance along one trace, in mm. */
type Interval = { start: number; end: number }

/**
 * Chooses which candidate runs to keep: the set that couples the most
 * length while using each stretch of either trace at most once and keeping
 * route order on both, the nearer partner on a tie. Whole candidates
 * compete with the pieces left after trimming nearest-first, so a nearer
 * pass that breaks route order (say a trace doubling back) can't knock
 * out the passes that keep it.
 */
export function selectCoupledRuns(candidates: CandidateRun[]): CoupledRun[] {
  const options = candidates.concat(trimNearestFirst(candidates))
  return bestOrderedChain(options).map(
    ({ midpointCenterlineSpacingMm: _spacing, ...run }) => run,
  )
}

/**
 * Trims candidates, nearest first, so no stretch of either trace is used
 * twice, and returns the pieces trimming cut from a candidate. A candidate
 * no nearer one overlaps is already among the candidates whole.
 */
function trimNearestFirst(candidates: CandidateRun[]): CandidateRun[] {
  const order = [...candidates].sort(
    (a, b) =>
      a.midpointCenterlineSpacingMm - b.midpointCenterlineSpacingMm ||
      a.positiveStartDistanceMm - b.positiveStartDistanceMm,
  )
  const usedPositive: Interval[] = []
  const usedNegative: Interval[] = []
  const pieces: CandidateRun[] = []
  for (const run of order) {
    const runParts = freeParts({ run, usedPositive, usedNegative })
    for (const free of runParts) {
      if (!isWholeRun({ run, runParts })) pieces.push(free)
      const positiveInterval = {
        start: free.positiveStartDistanceMm,
        end: free.positiveEndDistanceMm,
      }
      const negativeInterval = {
        start: free.negativeStartDistanceMm,
        end: free.negativeEndDistanceMm,
      }
      usedPositive.splice(
        insertionIndex({ intervals: usedPositive, interval: positiveInterval }),
        0,
        positiveInterval,
      )
      usedNegative.splice(
        insertionIndex({ intervals: usedNegative, interval: negativeInterval }),
        0,
        negativeInterval,
      )
    }
  }
  return pieces
}

/** True when `runParts`, the free parts of `run`, are the whole run. */
function isWholeRun({
  run,
  runParts,
}: {
  run: CandidateRun
  runParts: CandidateRun[]
}): boolean {
  const [part] = runParts
  return (
    runParts.length === 1 &&
    part?.positiveStartDistanceMm === run.positiveStartDistanceMm &&
    part.positiveEndDistanceMm === run.positiveEndDistanceMm
  )
}

/** The parts of `run` whose positive and negative stretches are both unused. */
function freeParts({
  run,
  usedPositive,
  usedNegative,
}: {
  run: CandidateRun
  usedPositive: Interval[]
  usedNegative: Interval[]
}): CandidateRun[] {
  // Work in positive-trace distance; the negative side maps onto it linearly.
  const negativePerPositive =
    (run.negativeEndDistanceMm - run.negativeStartDistanceMm) /
    (run.positiveEndDistanceMm - run.positiveStartDistanceMm)
  const blocked = overlapping({
    intervals: usedPositive,
    interval: {
      start: run.positiveStartDistanceMm,
      end: run.positiveEndDistanceMm,
    },
  })
  for (const used of overlapping({
    intervals: usedNegative,
    interval: {
      start: run.negativeStartDistanceMm,
      end: run.negativeEndDistanceMm,
    },
  })) {
    blocked.push({
      start:
        run.positiveStartDistanceMm +
        (used.start - run.negativeStartDistanceMm) / negativePerPositive,
      end:
        run.positiveStartDistanceMm +
        (used.end - run.negativeStartDistanceMm) / negativePerPositive,
    })
  }
  blocked.sort((a, b) => a.start - b.start)

  const parts: CandidateRun[] = []
  let cursor = run.positiveStartDistanceMm
  for (const cut of blocked) {
    if (cut.start - cursor > MIN_OVERLAP) {
      parts.push(sliceRun({ run, from: cursor, to: cut.start }))
    }
    cursor = Math.max(cursor, cut.end)
  }
  if (run.positiveEndDistanceMm - cursor > MIN_OVERLAP) {
    parts.push(sliceRun({ run, from: cursor, to: run.positiveEndDistanceMm }))
  }
  return parts
}

/**
 * The runs, in route order, that never share a stretch of either trace and
 * cover the most positive length, the smallest length-weighted offset on a
 * tie. Runs are swept by positive start; a Fenwick tree over negative end
 * order holds the best chains already ended on the positive trace.
 */
function bestOrderedChain(runs: CandidateRun[]): CandidateRun[] {
  const chainEnds: ChainEnd[] = runs.map((run) => ({
    run,
    negativeEndRank: 0,
  }))
  const byNegativeEnd = [...chainEnds].sort(
    (a, b) => a.run.negativeEndDistanceMm - b.run.negativeEndDistanceMm,
  )
  const negativeEnds = byNegativeEnd.map(({ run }) => run.negativeEndDistanceMm)
  for (const [position, end] of byNegativeEnd.entries()) {
    end.negativeEndRank = position + 1
  }
  const byPositiveEnd = [...chainEnds].sort(
    (a, b) => a.run.positiveEndDistanceMm - b.run.positiveEndDistanceMm,
  )
  const byPositiveStart = [...chainEnds].sort(
    (a, b) => a.run.positiveStartDistanceMm - b.run.positiveStartDistanceMm,
  )
  const tree = new Array<ScoredChain | undefined>(runs.length + 1)

  let ended = 0
  for (const current of byPositiveStart) {
    const { run } = current
    // Chains that end before this run on the positive trace become available.
    let end = byPositiveEnd[ended]
    while (
      end !== undefined &&
      end.run.positiveEndDistanceMm <
        run.positiveStartDistanceMm + CHAIN_TOLERANCE
    ) {
      if (!end.chain) throw new Error("Coupled run ended before it was scored")
      for (let at = end.negativeEndRank; at < tree.length; at += at & -at) {
        if (chainBeats({ chain: end.chain, other: tree[at] })) {
          tree[at] = end.chain
        }
      }
      ended++
      end = byPositiveEnd[ended]
    }
    // The best of them that also ends before this run on the negative trace.
    let before: ScoredChain | undefined
    for (
      let at = countEndsBefore({
        sortedEndDistancesMm: negativeEnds,
        thresholdDistanceMm: run.negativeStartDistanceMm + CHAIN_TOLERANCE,
      });
      at > 0;
      at -= at & -at
    ) {
      const chain = tree[at]
      if (chain && chainBeats({ chain, other: before })) before = chain
    }
    const length = run.positiveEndDistanceMm - run.positiveStartDistanceMm
    const chain: ScoredChain = {
      run,
      total: length,
      weightedOffset: run.midpointCenterlineSpacingMm * length,
      previous: before,
    }
    if (before) {
      chain.total += before.total
      chain.weightedOffset += before.weightedOffset
    }
    current.chain = chain
  }

  let best: ScoredChain | undefined
  for (const { chain } of chainEnds) {
    if (chain && chainBeats({ chain, other: best })) best = chain
  }
  const chain: CandidateRun[] = []
  for (let end = best; end !== undefined; end = end.previous) {
    chain.push(end.run)
  }
  return chain.reverse()
}

/** A run's position in negative-end order and the chain ending there once scored. */
type ChainEnd = {
  run: CandidateRun
  negativeEndRank: number
  chain?: ScoredChain
}

/** The last run of a chain and its cumulative positive length and weighted offset. */
type ScoredChain = {
  run: CandidateRun
  total: number
  weightedOffset: number
  previous: ScoredChain | undefined
}

/** True when a chain covers more length, or has a smaller weighted offset on a tie. */
function chainBeats({
  chain,
  other,
}: {
  chain: ScoredChain
  other: ScoredChain | undefined
}): boolean {
  if (!other) return true
  const byLength =
    Math.round(chain.total / MIN_OVERLAP) -
    Math.round(other.total / MIN_OVERLAP)
  if (byLength !== 0) return byLength > 0
  return chain.weightedOffset < other.weightedOffset
}

/** How many end distances in an ascending list are strictly below `thresholdDistanceMm` (binary search). */
function countEndsBefore({
  sortedEndDistancesMm,
  thresholdDistanceMm,
}: {
  sortedEndDistancesMm: number[]
  thresholdDistanceMm: number
}): number {
  let low = 0
  let high = sortedEndDistancesMm.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (sortedEndDistancesMm[middle]! < thresholdDistanceMm) {
      low = middle + 1
      continue
    }
    high = middle
  }
  return low
}

/** Intervals in a sorted, non-overlapping list that overlap `interval`. */
function overlapping({
  intervals,
  interval,
}: {
  intervals: Interval[]
  interval: Interval
}): Interval[] {
  const found: Interval[] = []
  for (
    let index = firstEndingAfter({ intervals, position: interval.start });
    index < intervals.length;
    index++
  ) {
    const candidate = intervals[index]!
    if (!(candidate.start < interval.end)) break
    found.push(candidate)
  }
  return found
}

/** Where to insert an interval into a sorted, non-overlapping list to keep it sorted. */
function insertionIndex({
  intervals,
  interval,
}: {
  intervals: Interval[]
  interval: Interval
}): number {
  // Insert by start: a trimmed piece can begin a rounding error before the
  // end of the interval it follows, and must still sort after it.
  let index = firstEndingAfter({ intervals, position: interval.start })
  let next = intervals[index]
  while (next && next.start <= interval.start) {
    next = intervals[++index]
  }
  return index
}

/** Index of the first interval that ends after `position` (binary search). */
function firstEndingAfter({
  intervals,
  position,
}: {
  intervals: Interval[]
  position: number
}): number {
  let low = 0
  let high = intervals.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (intervals[middle]!.end <= position) {
      low = middle + 1
      continue
    }
    high = middle
  }
  return low
}

/** The part of a run between two positive-trace distances, with negative-trace distances interpolated. */
function sliceRun({
  run,
  from,
  to,
}: {
  run: CandidateRun
  from: number
  to: number
}): CandidateRun {
  const span = run.positiveEndDistanceMm - run.positiveStartDistanceMm
  const negativeSpan = run.negativeEndDistanceMm - run.negativeStartDistanceMm
  const negativeStartDistanceMm =
    run.negativeStartDistanceMm +
    (negativeSpan * (from - run.positiveStartDistanceMm)) / span
  const negativeEndDistanceMm =
    run.negativeStartDistanceMm +
    (negativeSpan * (to - run.positiveStartDistanceMm)) / span
  return {
    positiveStartDistanceMm: from,
    positiveEndDistanceMm: to,
    negativeStartDistanceMm,
    negativeEndDistanceMm,
    midpointCenterlineSpacingMm: run.midpointCenterlineSpacingMm,
  }
}
