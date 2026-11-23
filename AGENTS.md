# Rules for agents and contributors

This is the only agent rules file. Do not add CLAUDE.md, GEMINI.md, .cursorrules or similar.

## Style guides

Follow the tscircuit handbook guides copied into this repo:

- [`docs/style/code.md`](docs/style/code.md): casing (and snake_case for Circuit JSON shaped objects), banned words, variable transparency, clear naming, named `Map` key types, no named closures, no `as any` / `as unknown`, thin entrypoint files.
- [`docs/style/api-design.md`](docs/style/api-design.md): truthy opt-in flags, flat objects, snake_case keys across the API boundary, erroring as early as possible.

The rules below add what those guides don't cover. Where they disagree, this file wins.

## Code

- Use `bun run format` to format code with Biome.
- Before a PR is ready, run `bun run format:check`, `bunx tsc --noEmit` and `bun test`. All must pass.
- Relative imports inside `lib/` have no extension (`from "./walk-trace"`). Code in `lib/` never uses the `lib/*` or `tests/*` path aliases, because consumers install `lib/` as source. Tests may.

### Functions

- **Use one named object for multiple inputs.** Any named function, method, named arrow or constructor that would take more than one parameter takes a single named object with an inline or named type, as in `walkTrace({ trace, pcbStackup, boardThickness })`. This replaces the context-passing pattern of `code.md` §1–2 here: no `fn(params, ctx)`.
  - Inline callbacks may use positional parameters, as in `xs.map((x, i) => …)`.
  - Keep signatures required by an interface, such as library callbacks. React components already receive a props object.
  - A pure arithmetic helper with two interchangeable operands may take them positionally.
- **Return, never override.** Return new values when transforming inputs. Do not use `push`, `splice`, `sort`, or field assignment on an argument or a record it contains, including Circuit JSON. Build and return a new array or object, then bind the result at the call site. Arrays created inside the function can be built up freely before returning.
- **Keep functions short.** Write long workflows as short orchestrators that call named stage functions.
- **Early returns and `continue`** instead of nested `if`/`else`. No value ternaries that hide a branch. Write the `if` out.
- **Top-level functions only.** The only exception to `code.md`'s no-named-closures rule is a factory whose job is to return a function.
- **No conditional spreads** (`...(x ? { a } : {})`). Build the object, then set the field in an `if`.

### Types

- **Named return types.** A function returning an object literal, tuple, nested array or a collection of id strings returns a named type with a one-line JSDoc.
- **JSDoc on named functions,** and parameter and return types in every named function's signature.
- **Reuse existing types before inventing one.** Check, in this order: `circuit-json`, `circuit-json-to-connectivity-map`, then `@tscircuit/props` / `@tscircuit/core`.
  - Derive ids from records: `PcbTrace["pcb_trace_id"]`, not `string`.
  - Use `PcbTrace`, `PcbTraceRoutePoint`, `Point` and `LayerRef` instead of hand-written `Extract<…>` or `{ x: number; y: number }`.
- **Read Circuit JSON through `@tscircuit/circuit-json-util`** (`cju(circuitJson).pcb_trace.list()`, `.source_bus.get(id)`, `.pcb_port.getWhere(...)`), not hand-written `filter((element) => element.type === …)` loops or ad-hoc index maps.
- No enums: use a string-literal union or an `as const` object. No back-compat aliases or shims: rename the thing and update every caller.

### Expressions

- **No `!!`.** Write the comparison: `point.via === true`.
- **No regular expressions in `lib/`.** Use `startsWith`, `includes`, `indexOf`, `slice`, `split`, or a small named helper. Tests may use a regex only inside an assertion.
- **Name magic numbers** as constants with a one-line reason (`const SAMPLE_LENGTH = 0.05` for the phase skew sample length in mm).

### Reuse and size

- **Prefer existing libraries.**
- **Prefer deleting code to adding it.** No fallbacks, no "restore if missing" paths, no defensive checks that another layer already owns.
- **Keep files under about 500 lines.** Split files by concern as they grow.

## Words

- Spell out terms the first time and in names: **phase skew**, not "skew" alone.

## Diagrams: Mermaid only

1. Every diagram is a fenced ```` ```mermaid ```` block inside Markdown: README, `docs/`, and PR descriptions alike. Never commit or upload diagram images.
2. Each diagram is one of exactly two concepts:
   - **Workflow:** `flowchart` (data or call flow: what happens, which module owns each step).
   - **State machine:** `stateDiagram-v2` (phases, transitions, terminal and failure states).
   Anything else (module tables, file maps, rule lists) is a Markdown table, not a diagram.
3. When code changes a workflow or a state machine, update its diagram in the same PR.

## Tests

- Reproductions and fixtures are **TSX source rendered through `@tscircuit/core`**, not hand-written Circuit JSON.
- Put one `test()` per file. Use a short, kebab-case filename that describes the behaviour in `tests/<source>/`, where `<source>` is the `lib/` file under test. Put shared setup in `tests/fixtures/`.

## Pull requests

- **Small and focused, stacked.** One concept per PR. Dependency or package bumps get their own PR at the bottom of the stack.
- **Specific titles.** Say what is added and where. If a PR also updates packages, the title says so.
- **Descriptions are short and plain:**
  - what the PR adds and why;
  - what it's stacked on;
  - a `### New concepts` section for every idea a reviewer meets for the first time, with 1–3 sentences on what it is, why it's needed and where it's used;
  - a line saying so when behaviour changes.
- Every layer of a stack must pass format check, type check and its own tests on its own.
- **Never rewrite a pushed PR's history.** PRs are squash-merged, so the commits inside a PR are its review record: they show how each change, including an agent's, was made.
  - Fixes are new commits. Don't amend, squash, rebase or force-push them.
  - To update a stack, merge the branch below into each PR above it, bottom to top (`git merge <branch below>`). After a lower PR is squash-merged, merge `main` into the next PR.
  - The only exception is a restructure the maintainer asks for explicitly, such as reordering, splitting or reviving PRs. Its description then says the history was rewritten.

## Private data (never commit)

- Real board Circuit JSON and geometry extracted from it stay local.
- Check `git status` and the diff before every commit.
