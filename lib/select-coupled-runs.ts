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

/** Trims candidates, nearest first, so no stretch of either trace is used twice. */
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
    for (const free of freeParts({ run, usedPositive, usedNegative })) {
      pieces.push(free)
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
  const total: number[] = new Array(runs.length)
  const weightedOffset: number[] = new Array(runs.length)
  const previous: number[] = new Array(runs.length)
  const scores: ChainScores = { total, weightedOffset }
  const byNegativeEnd = indicesSortedBy({
    runs,
    key: (run) => run.negativeEndDistanceMm,
  })
  const negativeEnds = byNegativeEnd.map(
    (index) => runs[index].negativeEndDistanceMm,
  )
  const rank: number[] = new Array(runs.length)
  for (let position = 0; position < byNegativeEnd.length; position++) {
    rank[byNegativeEnd[position]] = position + 1
  }
  const byPositiveEnd = indicesSortedBy({
    runs,
    key: (run) => run.positiveEndDistanceMm,
  })
  const tree = new Array<number>(runs.length + 1).fill(-1)

  let ended = 0
  for (const index of indicesSortedBy({
    runs,
    key: (run) => run.positiveStartDistanceMm,
  })) {
    const run = runs[index]
    // Chains that end before this run on the positive trace become available.
    while (
      ended < byPositiveEnd.length &&
      runs[byPositiveEnd[ended]].positiveEndDistanceMm <
        run.positiveStartDistanceMm + CHAIN_TOLERANCE
    ) {
      const done = byPositiveEnd[ended++]
      for (let at = rank[done]; at < tree.length; at += at & -at) {
        if (chainBeats({ scores, chain: done, other: tree[at] })) {
          tree[at] = done
        }
      }
    }
    // The best of them that also ends before this run on the negative trace.
    let before = -1
    for (
      let at = countEndsBefore({
        sortedEndDistancesMm: negativeEnds,
        thresholdDistanceMm: run.negativeStartDistanceMm + CHAIN_TOLERANCE,
      });
      at > 0;
      at -= at & -at
    ) {
      if (chainBeats({ scores, chain: tree[at], other: before })) {
        before = tree[at]
      }
    }
    const length = run.positiveEndDistanceMm - run.positiveStartDistanceMm
    total[index] = length
    weightedOffset[index] = run.midpointCenterlineSpacingMm * length
    if (before >= 0) {
      total[index] += total[before]
      weightedOffset[index] += weightedOffset[before]
    }
    previous[index] = before
  }

  let best = -1
  for (let index = 0; index < runs.length; index++) {
    if (chainBeats({ scores, chain: index, other: best })) best = index
  }
  const chain: CandidateRun[] = []
  for (let index = best; index >= 0; index = previous[index]) {
    if (chain.length >= runs.length) {
      throw new Error("Coupled run chain contains a cycle")
    }
    chain.push(runs[index])
  }
  return chain.reverse()
}

/** Each chain's total positive length and length-weighted offset, by the index of the run it ends at. */
type ChainScores = { total: number[]; weightedOffset: number[] }

/** True when the chain ending at run `chain` beats the one ending at `other` (-1 for none). */
function chainBeats({
  scores,
  chain,
  other,
}: {
  scores: ChainScores
  chain: number
  other: number
}): boolean {
  if (chain < 0) return false
  if (other < 0) return true
  const byLength =
    Math.round(scores.total[chain] / MIN_OVERLAP) -
    Math.round(scores.total[other] / MIN_OVERLAP)
  if (byLength !== 0) return byLength > 0
  return scores.weightedOffset[chain] < scores.weightedOffset[other]
}

/** Indices of `runs` in ascending order of `key`. */
function indicesSortedBy({
  runs,
  key,
}: {
  runs: CandidateRun[]
  key: (run: CandidateRun) => number
}): number[] {
  return runs
    .map((_, index) => index)
    .sort((a, b) => key(runs[a]) - key(runs[b]))
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
    if (sortedEndDistancesMm[middle] < thresholdDistanceMm) {
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
    index < intervals.length && intervals[index].start < interval.end;
    index++
  ) {
    found.push(intervals[index])
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
  while (index < intervals.length && intervals[index].start <= interval.start) {
    index++
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
    if (intervals[middle].end <= position) {
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
