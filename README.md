# circuit-json-to-differential-pair-phase-skew

## What is it?

A library that computes differential pair phase skew from
[Circuit JSON](https://github.com/tscircuit/circuit-json), the way KiCad's
differential pair phase skew tool shows it.

Phase skew is how much farther one trace of a differential pair has run than
its partner at each point along the pair, not only at the ends. Two traces can
have the same total length and still be out of step for most of the route.

The result is not stored in Circuit JSON. Viewers such as
[pcb-viewer](https://github.com/tscircuit/pcb-viewer) compute it on demand and
draw it.

## How to use it?

```bash
bun add github:tscircuit/circuit-json-to-differential-pair-phase-skew
```

```ts
import {
  DEFAULT_PHASE_SKEW_COLORS,
  getDifferentialPairPhaseSkew,
} from "circuit-json-to-differential-pair-phase-skew"

for (const pair of getDifferentialPairPhaseSkew({ circuitJson })) {
  pair.max_abs_phase_skew // largest phase skew on the pair, mm
  pair.end_to_end_length_delta // positive minus negative routed length, mm
  for (const segment of pair.positive_trace.segments) {
    segment.phase_skew // mm this trace is ahead (+) or behind (-) its partner; absent when unknown
  }
}
```

Each trace's `segments` cover its whole route. Colour them with
`DEFAULT_PHASE_SKEW_COLORS` (KiCad's): white at zero, blending to blue up to
the trace's `max_phase_skew` and to red down to its `min_phase_skew`, grey
where `phase_skew` is absent.
