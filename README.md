# LLM Circuits

Wire LLMs like resistors. Built on Cloudflare Workers + Workers AI, with an Astro front-end and a React Flow canvas.

## Concept

- **Voltage** — your prompt
- **Resistor** — a model (resistance ∝ parameter count)
- **Capacitor** — a memory slot. Holds text across runs; can inject into the next prompt and/or absorb the next output. Seeded from markdown files, persisted per-node in localStorage, editable in the UI.
- **Inductor** — resists change. Runs the next model N times on the same input and judge-votes for the most consistent answer.
- **Series** — chain of components
- **Parallel** — fan-out of models that converge at a join node

### Three interpretation modes (same diagram, different semantics)

1. `refine-vote` (default) — series asks each next model to refine the prior answer; parallel branches vote for consensus via a judge LLM.
2. `chain-ensemble` — series chains raw output; parallel branches synthesize via a judge LLM.
3. `physics` — series sums R; parallel splits a token budget by conductance (1/R) and runs each branch with that budget; surfaces R<sub>total</sub>.

### Capacitor modes

- `inject` — prepend the capacitor's stored text to the next stage's prompt as `### CONTEXT … ### END CONTEXT`. State is unchanged.
- `absorb` — overwrite the capacitor's stored text with the next stage's output.
- `both` — inject, run, then absorb (mirrors an RC step).

State is keyed by node id in browser localStorage. The first time a capacitor is touched, it seeds from its associated markdown file under `src/content/capacitors/`. The "✎ edit" button on the node opens an inline editor; "reset to seed" wipes the per-node state.

## Persistence

- Every change debounces (400 ms) into the URL hash (`#c=…`) **and** localStorage autosave.
- "🔗 Copy share link" puts the current URL on the clipboard — open it anywhere and the canvas rebuilds.
- "⟲ Reset" wipes both the autosave and the hash.
- Capacitor contents are intentionally local-only — share links transport the topology, not your stored memory.

## Presets

- **2 LLMs in series** — basic chain.
- **2 LLMs in parallel** — fork/join through a judge.
- **Capacitor — style inject** — `style-guide` capacitor in inject-only mode shapes every answer.
- **Capacitor — scratchpad memory** — empty scratchpad in `both` mode; two consecutive runs build conversational memory.
- **Inductor — stabilize a small LLM** — inductor ×3 in front of a small model resists noise on ambiguous prompts.

## Stack

Astro · React · React Flow · Tailwind · Cloudflare Workers · Workers AI binding.

## Develop

```bash
npm install
npm run dev               # local Astro dev (no AI binding — UI only)
npm run wrangler:remote   # build + wrangler dev (Workers AI via remote bindings)
```

Workers AI runs against the real Cloudflare backend; `wrangler.toml` marks the `AI` binding `remote = true`, so even a local `wrangler dev` calls real models.

## Deploy

```bash
npm run deploy
```

Builds Astro to `dist/` and runs `wrangler deploy` to publish a single Worker that serves the static assets and exposes `/api/run` and `/api/capacitors`.

## Layout

```
src/
  pages/index.astro                playground
  pages/api/run.ts                 Worker route — dispatches to env.AI, handles cap state
  pages/api/capacitors.ts          serves the seed library to the React island
  pages/blog/[...slug].astro       blog renderer
  components/CircuitCanvas.tsx     main canvas, sidebar palette, persistence
  components/ModelNode.tsx         resistor (LLM) node
  components/CapacitorNode.tsx     memory node with in-place editor
  components/InductorNode.tsx      self-vote stabilizer
  lib/models.ts                    Workers AI model IDs + R values
  lib/graph.ts                     discriminated CircuitNode union + topology validation
  lib/presets.ts                   the five starter circuits
  lib/execute.ts                   three-mode dispatcher + capacitor inject/absorb + inductor self-vote
  lib/runner.ts                    client → /api/run
  lib/persist.ts                   URL-hash + localStorage encode/decode + cap state
  content/blog/blogpost.md         writeup (stub)
  content/capacitors/*.md          seed library (style-guide, math-context, scratchpad)
```
