---
title: "LLMs as Resistors: How Far Does the Circuit Analogy Stretch?"
description: "Wiring language models in series and parallel — and dragging in capacitors and inductors when one LLM at a time wasn't enough."
pubDate: 2026-04-28
---

I spent a weekend wiring language models like circuit components. The result is [llm-circuits](https://github.com/diogodebastos/llm-circuits): each LLM is a resistor, your prompt is voltage, you compose them with fork/join wiring. The whole thing is one Cloudflare Worker, and every "current" you apply is a real Workers AI call — no mock layer.

The analogy mostly holds. Where it breaks is the interesting part.

## The kit

- **Voltage** — the prompt.
- **Resistor** — a model. R ∝ parameter count.
- **Series / Parallel** — chained vs. fanned-out models with a join.
- **Capacitor** — markdown-seeded memory. Injects context, absorbs output, persists per-node in `localStorage`.
- **Inductor** — runs a model N times and votes. Resistance to *variance*.
- **Diode** — one-way gate. Regex or judge-LLM check on the current text; if it fails, the branch is *blocked* (or passed through). Forward bias = approved output, reverse bias = refusal.
- **Transformer** — small instructed model that reformats its branch's text (translate, summarise, JSON-ify) without changing the topology. Two coils, two voltages — same shape.
- **Ground** — a refusal sink. A grounded branch drops out of the parallel join entirely; the vote/ensemble proceeds without it. Think "this branch refused — count it as silent, not as a no."

## Three modes for the same diagram

Forcing yourself to pick a semantics makes the analogy concrete instead of vibey:

- **`refine-vote`** — series refines, parallel branches answer independently and a judge LLM picks consensus.
- **`chain-ensemble`** — series feeds raw output forward, parallel synthesizes.
- **`physics`** — R<sub>series</sub> = ΣR<sub>i</sub>, R<sub>parallel</sub> = 1/Σ(1/R<sub>i</sub>). Parallel branches split a fixed token budget *by conductance*, so a 3B paired with a 70B gets most of the budget — exactly like a current divider. Putting the math on screen is a much better intuition for load balancing than another paragraph of prose.

### The token-budget formula, in one paragraph

Each model has a synthetic resistance R ∝ parameters (a 70B is "more resistive" than a 3B in the sense that it costs more to push a token through it). Conductance is G = 1/R. Given a budget B = 5120 tokens, branch *i* gets

> max_tokens<sub>i</sub> = round( G<sub>i</sub> / Σ G<sub>k</sub> · B )

So in a parallel of `Llama-70B (R=70)` ‖ `Llama-3B (R=3)`, the 3B grabs 70/(70+3) ≈ 96 % of the budget and the 70B gets the remaining 4 %. That's the opposite of what you'd intuit if you treated R as "capacity" — and it's the right call, because in current dividers *low-resistance branches carry more current*. The 3B has more headroom to ramble; the 70B is held to a tight, dense answer. In practice this is a surprisingly good heuristic for "let the small model brainstorm, let the big model conclude." The whole point of putting `R = 1/G` on screen is that it forced me to defend that choice with a number, not a vibe.

## Where it breaks

- No Ohm's law. Models don't lose tokens proportionally to size.
- Sources combine non-trivially: two prompts into one LLM is routine; two voltage sources in parallel is a bug.
- No conservation law — which is exactly why ensembles work for LLMs and not resistors.
- Every parallel join is *another LLM*. There's no electrical equivalent of "and now an op-amp arbitrates."

The diagram is a teaching abstraction, not a predictive one. It earns its keep when it forces you to ask "wait — what does parallel even mean here?"

## Presets that pushed the engine

Two-LLMs-in-parallel was enough to explain the vocabulary. Real circuits broke things in useful ways.

**Code review** — three reviewer branches (correctness, security, style), each with its own role-injected capacitor and a different model family so failures don't correlate, converging on a merge capacitor + merger model. To support it I had to:

- relax the validator to allow **N source nodes**, broadcasting the prompt across an implicit initial parallel stage,
- scope **capacitor inject/absorb to a single branch** instead of the parallel join,
- add a **per-node `maxTokens` override**, since the platform default truncates code-review-length outputs.

Defaults to `physics` mode so the merger sees each reviewer's verbatim output instead of laundering it through the judge.

**Best-of-four** — four diverse models in parallel, a "judge brief" capacitor injects selection criteria into a final model that returns the single best answer. The smallest circuit that demonstrates why selection criteria want to live in an editable, version-controlled capacitor instead of hard-coded into the join.

## BYOK

The demo originally ran every call through the project's Workers AI binding, which made it feel like a hosted toy. There's now a "Connect Cloudflare" modal: paste an account ID and API token, the front-end stores them in `localStorage` and dispatches a custom event so the canvas picks them up without a reload. The backend validates the account ID format and switches from the shared binding to the REST AI API when creds are present. Your circuits, your bill.

## Implementation

One Worker. Astro builds the React Flow canvas as a client island and emits a single Worker entry serving static assets plus:

- `POST /api/run` — `{ circuit, mode, prompt, capStates, seeds }`. Worker validates the topology (fork/join only, no cycles, capacitors only in series), walks the stages, dispatches each through `env.AI.run(...)` (or the REST API for BYOK), schedules capacitor effects forward and applies them around the next stage. Returns per-node trace + updated capacitor states.
- `GET /api/capacitors` — serves the markdown content collection so the dropdown shows seed bodies.
- Real-time per-node status streamed over **SSE** so the canvas lights up node-by-node as the run progresses.

`wrangler.toml` declares `[ai] binding = "AI", remote = true`, so even `wrangler dev` hits real Workers AI. CI auto-deploys on push to `main`.

Front-end state lives in the URL hash as a base64url-encoded `{v:1, c:<circuit>}` — every wiring is a shareable link, and the version field means old links keep working when the schema changes. Capacitor state stays in `localStorage` on purpose: sharing transports the wiring, not your memory.

## Extending the metaphor: Diode, Transformer, Ground

The first pass of the kit was just "resistor + capacitor + inductor." That carries you to about *ensemble + memory + self-vote* and stops. Three new components opened up the cases I actually had in mind:

**Diode — one-way gate.** A node with two modes: a `regex` test, or a `judge` LLM that returns yes/no on a rubric you write. If the text passes, current flows. If it fails, you choose: `block` (cut the branch) or `passthrough` (annotate but continue). The interesting case is *judge-mode diodes inside a parallel stage*: each reviewer branch has its own gate ("is this answer factually grounded?"), and grounded-out branches don't get to vote.

**Transformer — branch-local reformat.** A small instructed model whose only job is to convert text — "translate to French," "extract the JSON," "rewrite as a bullet list." Topologically it's a model node, but with the instruction baked in so the canvas stays readable. Think of the two coils as input and output domains: same energy, different representation.

**Ground — refusal sink.** A diode that fails into ground silently removes its branch from the parallel join. The vote proceeds with N−1 voters instead of N. This is the difference between "this branch said no" and "this branch had nothing to say" — which matters for consensus arithmetic in `refine-vote`.

The reason these three earn their slots and "op-amp" and "switch" don't (yet): each maps to a single, common LLM-pipeline pattern (guardrail / format-shift / soft-refusal) and each has a *visible* electrical analogue. The op-amp version of feedback agents needs a notion of time-domain, which the canvas doesn't model — that's still future work.

## AI Gateway: caching the bill

Workers AI calls go through the `env.AI` binding — easy, but opaque. Wrap that binding with **AI Gateway** (free tier: 100k logs/day) and you get caching, rate limiting, and per-call cost telemetry "for free." `wrangler.toml` exposes a gateway as an optional env var:

```toml
[ai]
binding = "AI"
remote = true
# gateway = { id = "llm-circuits" }   # uncomment after creating in CF dashboard
```

When set, every `env.AI.run(model, input, { gateway: { id, skipCache: false } })` is logged and cached. The result panel surfaces, per call:

- `cached ✓` (1 ms response time, $0)
- `neurons used` (what the call actually cost on Workers AI's pricing unit)
- `latency`

Run a circuit twice with the same prompt, watch every node go green-with-a-cache-mark on the second run. This turns the canvas into something I'd actually demo to someone evaluating Workers AI — *here's the cost dropping in real time, here's the cache key, here's the log entry in the dashboard.*

## Scaling capacitors: a Durable Objects design (not implemented — yet)

`localStorage` capacitors are fine for one user. They're terrible for *team*-shared memory: a "house style guide" capacitor shared across collaborators, or a long-running scratchpad that survives across browsers, or a knowledge capacitor that two parallel branches *both* absorb into. None of that is solvable on the client.

The clean Cloudflare answer is **Durable Objects**: each capacitor becomes one DO addressed by its slug, with strong single-writer consistency for free.

```toml
# wrangler.toml — uncomment when on Workers Paid
# [[durable_objects.bindings]]
# name  = "CAPS"
# class_name = "Capacitor"
#
# [[migrations]]
# tag = "v1"
# new_sqlite_classes = ["Capacitor"]
```

```ts
// worker/Capacitor.ts
export class Capacitor implements DurableObject {
  constructor(private state: DurableObjectState) {}
  async fetch(req: Request) {
    const url = new URL(req.url);
    if (req.method === "GET")  return new Response(await this.state.storage.get<string>("text") ?? "");
    if (req.method === "PUT")  { await this.state.storage.put("text", await req.text()); return new Response("ok"); }
    return new Response("method not allowed", { status: 405 });
  }
}

// /api/cap/[id].ts
const id = env.CAPS.idFromName(params.id);
return env.CAPS.get(id).fetch(req);
```

Why DO and not KV? KV is eventually consistent — fine for seeds, dangerous for absorb-then-inject in the same run. DO gives you *single-writer-per-id* serialization, so two parallel branches absorbing into the same capacitor produce a deterministic interleave instead of a last-writer-wins race.

Why isn't it shipped? Durable Objects are a Workers Paid feature ($5/month minimum), and the explicit goal of this project is to stay free-tier. The wiring above is the entire diff — capacitor nodes get a "share globally" toggle, the runner switches the cap-state path from `localStorage` to `fetch("/api/cap/" + slug)`, the rest of the pipeline is unchanged. The day this becomes worth $5, it's a one-commit flip.

## Eval mode and MCP export

The two follow-on features that turn the canvas from a toy into a research artifact:

**Compare-3-modes.** A button that runs the same circuit under all three semantics in parallel and renders a table — `output | R_total | latency | tokens | neurons` per row. The point is to make the *same* topology answer the same question three ways and show you side-by-side how `physics` vs. `refine-vote` differ on a real prompt. Most of the time the verdict is "they're close, refine-vote is slightly better, physics is cheaper" — but the cases where they *disagree* are where prompt engineering decisions actually live.

**Golden-answer eval.** A capacitor with `role: "golden"` becomes the rubric for a judge LLM that scores each run 0–10 against the stored text. Cross with compare-3-modes and you get a scatter plot: R<sub>total</sub> on x-axis, quality on y-axis, three points per run. The question "is the bigger circuit worth it?" becomes a chart instead of a vibe.

**MCP export.** Any saved circuit can emit a JSON tool spec — name, input schema (the prompt), output schema (final text), embedded topology — that drops into a host MCP server as a single tool. Your handcrafted "code-review-3-reviewer" circuit becomes `circuit.codeReview` callable from any MCP-aware agent. The spec is portable; the runtime stays on Workers AI.

## What's next

- Transient analysis — replay the same prompt N times through a circuit with a capacitor and *plot* stored-text length vs. step, giving the analogy back its time-domain story.
- Op-amp / feedback agents (needs the time-domain piece first).
- Switches (tool-routers) — partway between diode and transformer; deferred until the demand is real.

## Try it

```bash
git clone https://github.com/diogodebastos/llm-circuits
cd llm-circuits
npm install
npm run wrangler:remote
```

The point isn't that LLMs are resistors. They aren't. The point is that two-terminal components are a *cheap* way to talk about composition, and we don't have many other cheap ways. The places this analogy breaks aren't bugs — they're the actual ways LLM systems differ from physical ones, and noticing them by playing with a wiring diagram beats reading another taxonomy.
