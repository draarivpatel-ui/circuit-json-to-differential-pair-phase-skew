import { RootCircuit } from "@tscircuit/core"
import type { AnyCircuitElement } from "circuit-json"
import type { ReactElement } from "react"

/** Renders a TSX board through core, with design rule checks off, once routing and every other phase settle. */
export async function renderCircuit(
  element: ReactElement,
): Promise<AnyCircuitElement[]> {
  const circuit = new RootCircuit({ platform: { drcChecksDisabled: true } })
  circuit.add(element)
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}
