import type * as source from "lib/index"
import type * as declarations from "lib/index.d"

type Assert<Condition extends true> = Condition

/** Keep the declaration entry point's value exports in sync with the source entry point. */
export type MatchingPhaseSkewExports = Assert<
  [typeof source, typeof declarations] extends [
    typeof declarations,
    typeof source,
  ]
    ? true
    : false
>
