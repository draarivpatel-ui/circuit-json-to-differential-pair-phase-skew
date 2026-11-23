import type {
  AutorouterCompleteEvent,
  AutorouterErrorEvent,
  AutorouterProgressEvent,
  GenericLocalAutorouter,
  SimpleRouteJson,
  SimplifiedPcbTrace,
} from "@tscircuit/core"

/** Builds the traces a test wants core to receive for its routing input. */
export type RouteGeneratorFn = (
  input: SimpleRouteJson,
) => Promise<SimplifiedPcbTrace[]>

/** A board `autorouter.algorithmFn` that hands core the traces a test writes for its routing input. */
export type BasicAutorouterFn = (
  simpleRouteJson: SimpleRouteJson,
) => Promise<GenericLocalAutorouter>

/** The arguments of `GenericLocalAutorouter.on`: an event name and its handler. */
type AutorouterSubscription =
  | ["complete", (ev: AutorouterCompleteEvent) => void]
  | ["error", (ev: AutorouterErrorEvent) => void]
  | ["progress", (ev: AutorouterProgressEvent) => void]

/** An autorouter that completes with the traces from its route generator. */
class BasicAutorouter implements GenericLocalAutorouter {
  input: SimpleRouteJson
  isRouting = false
  routeGeneratorFn: RouteGeneratorFn
  completeHandlers: Array<(event: AutorouterCompleteEvent) => void> = []

  constructor({
    input,
    routeGeneratorFn,
  }: {
    input: SimpleRouteJson
    routeGeneratorFn: RouteGeneratorFn
  }) {
    this.input = input
    this.routeGeneratorFn = routeGeneratorFn
  }

  /** Generates the traces and reports them as complete on the next tick. */
  async start(): Promise<void> {
    const traces = await this.routeGeneratorFn(this.input)
    setTimeout(() => {
      for (const handler of this.completeHandlers) {
        handler({ type: "complete", traces })
      }
    }, 0)
  }

  /** Nothing to stop: the traces are generated in one go. */
  stop(): void {}

  /** Registers a handler; only completion is ever reported. */
  on(...[event, callback]: AutorouterSubscription): void {
    if (event === "complete") this.completeHandlers.push(callback)
  }

  /** Core only routes this autorouter asynchronously. */
  solveSync(): SimplifiedPcbTrace[] {
    throw new Error("Not implemented")
  }
}

/** Creates an autorouter whose traces `routeGeneratorFn` builds, so a test controls exactly how core routes. */
export function createBasicAutorouter(
  routeGeneratorFn: RouteGeneratorFn,
): BasicAutorouterFn {
  return async (simpleRouteJson) =>
    new BasicAutorouter({ input: simpleRouteJson, routeGeneratorFn })
}
