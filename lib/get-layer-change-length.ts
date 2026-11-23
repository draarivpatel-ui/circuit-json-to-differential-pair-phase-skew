import type {
  LayerRef,
  PcbBoard,
  PcbStackup,
  PcbStackupLayer,
} from "circuit-json"

/** What a layer change travels through: the board's stackup when it has one, else its thickness in mm and copper layer count. */
export type LayerChangeBoard = {
  pcbStackup: PcbStackup | null
  boardThickness: PcbBoard["thickness"]
  copperLayerCount: PcbBoard["num_layers"]
}

/**
 * Z-distance in mm between two copper layers, zero when they are the same.
 *
 * With a stackup this is KiCad's via length: all of an outer copper layer,
 * half of an inner copper layer at either end, and every layer between.
 * For a board without a stackup, or whose stackup lacks one of the two
 * layers, it is an estimate: copper layers spaced evenly through the board's
 * thickness, so top to bottom is the whole thickness. KiCad's default
 * stackup is close but not equal, as it spaces the dielectrics after taking
 * off copper and solder mask (1.58 mm rather than 1.6 mm top to bottom on
 * a 1.6 mm 4-layer board). Null when one of the layers isn't among the
 * board's copper layers, so the distance can't be known.
 */
export function getLayerChangeLength({
  fromLayer,
  toLayer,
  pcbStackup,
  boardThickness,
  copperLayerCount,
}: { fromLayer: LayerRef; toLayer: LayerRef } & LayerChangeBoard):
  | number
  | null {
  if (fromLayer === toLayer) return 0
  if (pcbStackup === null) {
    return getEvenLayerChangeLength({
      fromLayer,
      toLayer,
      boardThickness,
      copperLayerCount,
    })
  }
  const fromIndex = getCopperLayerIndex({ pcbStackup, layer: fromLayer })
  const toIndex = getCopperLayerIndex({ pcbStackup, layer: toLayer })
  if (fromIndex < 0 || toIndex < 0) {
    return getEvenLayerChangeLength({
      fromLayer,
      toLayer,
      boardThickness,
      copperLayerCount,
    })
  }

  const firstIndex = Math.min(fromIndex, toIndex)
  const lastIndex = Math.max(fromIndex, toIndex)
  let layerChangeLength = 0
  for (let index = firstIndex; index <= lastIndex; index++) {
    const stackupLayer = pcbStackup.layers[index]
    if (stackupLayer.layer_type === "soldermask") continue
    const isEndLayer = index === firstIndex || index === lastIndex
    if (isEndLayer && !isOuterCopperLayer(stackupLayer)) {
      layerChangeLength += stackupLayer.thickness / 2
      continue
    }
    layerChangeLength += stackupLayer.thickness
  }
  return layerChangeLength
}

/**
 * Z-distance between two copper layers spaced evenly through the board's
 * thickness, in mm, or null when one of them isn't among its copper layers.
 */
function getEvenLayerChangeLength({
  fromLayer,
  toLayer,
  boardThickness,
  copperLayerCount,
}: { fromLayer: LayerRef; toLayer: LayerRef } & Omit<
  LayerChangeBoard,
  "pcbStackup"
>): number | null {
  const fromPosition = getCopperLayerPosition({
    layer: fromLayer,
    copperLayerCount,
  })
  const toPosition = getCopperLayerPosition({
    layer: toLayer,
    copperLayerCount,
  })
  if (fromPosition === null || toPosition === null) return null
  return (
    (boardThickness * Math.abs(fromPosition - toPosition)) /
    (copperLayerCount - 1)
  )
}

/**
 * A copper layer's position from the top: 0 for top, k for innerk, and one
 * less than the layer count for bottom. Null when the board has no such
 * layer: an inner layer past its count, or any layer of a board with fewer
 * than two.
 */
function getCopperLayerPosition({
  layer,
  copperLayerCount,
}: {
  layer: LayerRef
  copperLayerCount: number
}): number | null {
  if (copperLayerCount < 2) return null
  if (layer === "top") return 0
  const bottomPosition = copperLayerCount - 1
  if (layer === "bottom") return bottomPosition
  const innerPosition = Number(layer.slice(INNER_LAYER_PREFIX.length))
  if (innerPosition >= bottomPosition) return null
  return innerPosition
}

/** Inner copper layers are named this followed by their position from the top, as in `inner1`. */
const INNER_LAYER_PREFIX = "inner"

/** Position of a copper layer in the stackup's top-to-bottom layer list, or -1 when the stackup lacks it. */
function getCopperLayerIndex({
  pcbStackup,
  layer,
}: {
  pcbStackup: PcbStackup
  layer: LayerRef
}): number {
  return pcbStackup.layers.findIndex(
    (stackupLayer) =>
      stackupLayer.layer_type === "copper" && stackupLayer.layer === layer,
  )
}

/** True for top or bottom copper, which a layer change passes through completely. */
function isOuterCopperLayer(stackupLayer: PcbStackupLayer): boolean {
  if (stackupLayer.layer_type !== "copper") return false
  return stackupLayer.layer === "top" || stackupLayer.layer === "bottom"
}
