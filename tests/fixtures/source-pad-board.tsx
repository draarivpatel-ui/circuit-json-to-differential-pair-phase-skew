import type { AnyCircuitElement } from "circuit-json"
import type { ReactElement } from "react"
import type { PairPathPoint } from "./pair-board"
import { renderCircuit } from "./render-circuit"

/** Options for {@link SourcePadBoard}. */
export type SourcePadBoardProps = {
  /** DP's source pad, a footprint pad at the origin with port hint "1". */
  sourcePad: ReactElement
  /** DP's `pcbPath`, relative to the centre of its source pad. */
  positivePath: PairPathPoint[]
  /** Give DP core's native teardrops. */
  pcbTeardrops?: boolean
}

/**
 * A board where DP leaves the centre of `sourcePad` at (-9, 1) for a load
 * pad at (9, 1), and DN runs straight 2 mm below it. The 1.85 mm declared
 * gap matches the traces from end to end.
 */
export function SourcePadBoard({
  sourcePad,
  positivePath,
  pcbTeardrops,
}: SourcePadBoardProps): ReactElement {
  return (
    <board width="24mm" height="8mm" routeRemaining={false}>
      <chip
        name="TP_SRC"
        pcbX={-9}
        pcbY={1}
        footprint={<footprint>{sourcePad}</footprint>}
      />
      <testpoint
        name="TP_LOAD"
        footprintVariant="pad"
        padDiameter="0.3mm"
        doNotPlace
        pcbX={9}
        pcbY={1}
      />
      <testpoint
        name="TN_SRC"
        footprintVariant="pad"
        padDiameter="0.3mm"
        doNotPlace
        pcbX={-9}
        pcbY={-1}
      />
      <testpoint
        name="TN_LOAD"
        footprintVariant="pad"
        padDiameter="0.3mm"
        doNotPlace
        pcbX={9}
        pcbY={-1}
      />
      <trace
        name="DP"
        from=".TP_SRC > .pin1"
        to=".TP_LOAD > .pin1"
        thickness="0.15mm"
        pcbTeardrops={pcbTeardrops}
        pcbPath={positivePath}
      />
      <trace
        name="DN"
        from=".TN_SRC > .pin1"
        to=".TN_LOAD > .pin1"
        thickness="0.15mm"
        pcbPath={[]}
      />
      <differentialpair
        name="PAIR"
        positiveConnection="DP"
        negativeConnection="DN"
        pcbTraceGap="1.85mm"
      />
    </board>
  )
}

/** Renders {@link SourcePadBoard} through core. */
export function renderSourcePadBoard(
  props: SourcePadBoardProps,
): Promise<AnyCircuitElement[]> {
  return renderCircuit(<SourcePadBoard {...props} />)
}
