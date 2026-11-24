import { Fragment, type ReactElement } from "react"
import type { PairPathPoint } from "./pair-board"

/** The routed pair used in the viewer's phase skew demo boards. */
function Pair({
  name,
  y = 0,
  positivePath = [],
  negativePath = [],
  loadLayer = "top",
}: {
  name: string
  y?: number
  positivePath?: PairPathPoint[]
  negativePath?: PairPathPoint[]
  loadLayer?: "top" | "bottom"
}): ReactElement {
  const legs = [
    { name: `${name}_P`, y: y + 0.6, path: positivePath },
    { name: `${name}_N`, y: y - 0.6, path: negativePath },
  ]
  return (
    <>
      {legs.map(({ name, y, path }) => (
        <Fragment key={name}>
          <testpoint
            name={`${name}_SRC`}
            footprintVariant="pad"
            padDiameter={0.65}
            doNotPlace
            pcbX={-12}
            pcbY={y}
          />
          <testpoint
            name={`${name}_LOAD`}
            footprintVariant="pad"
            padDiameter={0.65}
            doNotPlace
            pcbX={12}
            pcbY={y}
            layer={loadLayer}
          />
          <trace
            name={name}
            from={`.${name}_SRC > .pin1`}
            to={`.${name}_LOAD > .pin1`}
            thickness="0.24mm"
            pcbPath={path}
          />
        </Fragment>
      ))}
      <differentialpair
        name={name}
        positiveConnection={`${name}_P`}
        negativeConnection={`${name}_N`}
        pcbTraceGap="0.96mm"
      />
    </>
  )
}

/** A 45° detour measured from the source pad, with its height signed by direction. */
function detour({ x, height }: { x: number; height: number }): PairPathPoint[] {
  const run = Math.abs(height)
  return [
    { x, y: 0 },
    { x: x + run, y: height },
    { x: x + run + 0.8, y: height },
    { x: x + 2 * run + 0.8, y: 0 },
  ]
}

/** Two straight traces that stay in step. */
export function MatchedPairBoard(): ReactElement {
  return (
    <board width={28} height={8} routeRemaining={false}>
      <Pair name="MATCHED" />
    </board>
  )
}

/** A two-detour meander near the load catches up with the positive trace. */
export function LoadEndMeanderBoard(): ReactElement {
  return (
    <board width={28} height={9} routeRemaining={false}>
      <Pair
        name="MEANDER"
        positivePath={detour({ x: 2, height: 2.2 })}
        negativePath={[
          ...detour({ x: 16, height: -1.1 }),
          ...detour({ x: 20, height: -1.1 }),
        ]}
      />
    </board>
  )
}

/** Compensated and uncompensated pairs for comparison. */
export function LocalCompensationBoard(): ReactElement {
  return (
    <board width={28} height={11} routeRemaining={false}>
      <Pair
        name="COMPENSATED"
        y={2.2}
        positivePath={detour({ x: 3, height: 0.9 })}
        negativePath={detour({ x: 6, height: -0.9 })}
      />
      <silkscreentext text="COMPENSATED" pcbX={5} pcbY={3.8} fontSize={0.7} />
      <Pair
        name="UNCOMPENSATED"
        y={-2.2}
        positivePath={detour({ x: 3, height: 0.9 })}
      />
      <silkscreentext
        text="UNCOMPENSATED"
        pcbX={5}
        pcbY={-3.8}
        fontSize={0.7}
      />
    </board>
  )
}

/** A pair that changes layers between compensating detours. */
export function LayerChangeBoard(): ReactElement {
  const via: PairPathPoint[] = [{ x: 12, y: 0, via: true, toLayer: "bottom" }]
  return (
    <board width={28} height={9} routeRemaining={false}>
      <Pair
        name="LAYER_CHANGE"
        loadLayer="bottom"
        positivePath={[...detour({ x: 3, height: 1.1 }), ...via]}
        negativePath={[...via, ...detour({ x: 17, height: -1.1 })]}
      />
    </board>
  )
}

/** A pair with detours on both traces for testing palette overrides. */
export function CustomColorsBoard(): ReactElement {
  return (
    <board width={28} height={9} routeRemaining={false}>
      <Pair
        name="CUSTOM_COLORS"
        negativePath={detour({ x: 5, height: -1.4 })}
        positivePath={detour({ x: 15, height: 2.1 })}
      />
    </board>
  )
}
