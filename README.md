# LLM Circuits

Wire LLMs like resistors. Built on Cloudflare Workers + Workers AI, with an Astro front-end and a React Flow canvas.

## Concept

- **Voltage** — your prompt
- **Resistor** — a model (resistance ∝ parameter count)
- **Series** — chain of models
- **Parallel** — fan-out of models that converge at a join node

Three interpretation modes for the same diagram:
1. `chain-ensemble` — series chains output; parallel synthesizes via a judge LLM.
2. `refine-vote` — series refines the prior answer; parallel votes for consensus.
3. `physics` — parallel splits a token budget by conductance (1/R); shows R<sub>total</sub>.

## Stack

Astro · React · React Flow · Tailwind · Cloudflare Workers · Workers AI binding.

## Develop

```bash
npm install
npm run dev               # local Astro dev (no AI binding — UI only)
npm run wrangler:remote   # wrangler dev --remote — real Workers AI
```

Workers AI requires `--remote` mode locally; the `AI` binding does not work in pure-local `wrangler dev`.

## Deploy

```bash
npm run deploy
```

Builds Astro to `dist/` and runs `wrangler deploy` to publish a Worker that serves the static assets and exposes `/api/run`.

## Layout

```
src/
  pages/index.astro          playground
  pages/api/run.ts           Worker route — dispatches to env.AI
  pages/blog/[...slug].astro blog renderer
  components/CircuitCanvas.tsx
  components/ModelNode.tsx
  lib/models.ts              registry of Workers AI model IDs + R values
  lib/graph.ts               topology validation (single source/sink, fork/join)
  lib/presets.ts             2-series and 2-parallel default circuits
  lib/execute.ts             three-mode dispatcher
  lib/runner.ts              client → /api/run
  content/blog/blogpost.md   writeup (stub)
```
