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
import { DEFAULT_PHASE_SKEW_COLORS } from "circuit-json-to-differential-pair-phase-skew"

DEFAULT_PHASE_SKEW_COLORS.positive // "rgb(0, 0, 255)"
```
