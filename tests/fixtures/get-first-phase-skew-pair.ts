import type { AnyCircuitElement } from "circuit-json"
import {
  type DifferentialPairPhaseSkew,
  getDifferentialPairPhaseSkew,
} from "lib/index"

/** Returns the first measured pair, failing the test if the fixture produced none. */
export function getFirstPhaseSkewPair({
  circuitJson,
}: {
  circuitJson: AnyCircuitElement[]
}): DifferentialPairPhaseSkew {
  const [pair] = getDifferentialPairPhaseSkew({ circuitJson })
  if (!pair) throw new Error("Expected a measured differential pair")
  return pair
}
