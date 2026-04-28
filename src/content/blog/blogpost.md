---
title: "LLMs as Resistors: How Far Does the Circuit Analogy Stretch?"
description: "Wiring language models in series and parallel — and dragging in capacitors and inductors when one LLM at a time wasn't enough."
pubDate: 2026-04-28
---

I spent a weekend wiring language models like circuit components. The result is a small playground at [llm-circuits](https://github.com/diogodebastos/llm-circuits) where each LLM is a resistor, your prompt is voltage, and you compose them with the same kind of fork/join wiring you'd see in a junior-year electronics class. It runs on Cloudflare Workers AI — every "current" you apply is a real call to a real model.

This post is the case for and against that analogy. It mostly holds. Sometimes it doesn't. And the places where it breaks turned out to be the most interesting parts of the project.

## The pitch

Two-terminal components are a small vocabulary. Anyone who has ever drawn a battery, a resistor, and a wire can explain a divider, a low-pass filter, or even an op-amp follower. Compare that to "agent topologies." We've got chains, ensembles, mixture-of-experts, refine loops, debate, self-consistency. Every one of them gets re-explained per paper. None of them composes in a way you can sketch on a napkin.

So: what if we used the napkin we already had?

- **Voltage** — your prompt. The signal applied to the network.
- **Resistor** — a model. A component that transforms the signal at some "cost." Resistance ≈ parameter count, because that's the closest thing LLMs have to a unit cost.
- **Series** — chained models, output of one feeding the next.
- **Parallel** — same input fanning out to several models, recombining at a join.
- **Capacitor** — memory. Holds state across runs; can release it back into the next prompt.
- **Inductor** — resistance to *change*. Stabilizes a flaky output by self-voting across repeated runs.

That's the kit. The playground exposes those five components, two preset wirings (`series-2`, `parallel-2`), and a freeform builder. The interesting part is what to *do* once you press "apply current."

## Three interpretation modes for the same diagram

A wire connecting two LLMs can mean several different things, and forcing yourself to choose makes the analogy concrete instead of vibey. The playground lets you switch between three modes for any circuit you've drawn:

### 1. `refine-vote` (default)

- **Series**: each downstream model is asked to *refine* the prior answer. The prompt becomes `Refine and improve the following answer…`. This is the closest thing to passing current "through" a resistor and seeing it lose energy along the way — except in our case the signal can also gain coherence.
- **Parallel**: every branch answers independently from the same prompt; a judge LLM reads all the answers and outputs the consensus.

This is what most "agent pipelines" actually are when you squint. It's a useful default because it punishes weak first answers (refinement adds value) and rewards branches that agree (vote suppresses outliers).

### 2. `chain-ensemble`

- **Series**: raw output of model N becomes the prompt of model N+1. No refine framing — the next model just sees the prior model's text.
- **Parallel**: same prompt to all branches, then a judge synthesizes the best single answer.

This mode is more honest about what "chaining" really is in practice: you're handing model B a prompt model A wrote. Sometimes that's powerful (decomposition + execution); often it's awful (model A drifts off-topic and model B faithfully follows). Useful for showing students why you can't just stack LLMs and expect things to get better.

### 3. `physics`

The faithful one. Each model has resistance R proportional to its parameter count. The playground shows you R<sub>total</sub> at the end of a run, computed the way you'd expect:

- **Series**: R<sub>total</sub> = ΣR<sub>i</sub>
- **Parallel**: R<sub>total</sub> = 1 / Σ(1/R<sub>i</sub>) (so smaller models dominate the conductance)

For parallel branches we then split a fixed token budget by *conductance* — that is, smaller models get a larger share of the budget, exactly as more current would flow through a lower-resistance branch in a real divider. The combiner just concatenates the weighted outputs with their weight printed alongside.

This mode doesn't try to be the best pipeline. It's there to make the math feel like the diagram. When you put a 70B model in parallel with a 3B, the 70B basically sees `max_tokens` clamped near zero, and you can *see* on screen why the 3B carries the conversation — which is a much better intuition for "load balancing" than another paragraph of prose.

## Capacitors: the most useful surprise

I added capacitors halfway through, expecting them to be a cute joke. They turned out to be the feature that makes the playground actually usable across reloads.

A capacitor in this analogy:

- has a starting "charge" (a markdown file under `src/content/capacitors/`),
- can **inject** its text as context for the next stage,
- can **absorb** the next stage's output back into itself,
- persists per-node in `localStorage`.

That gives you three operating modes that map cleanly onto things you'd actually want from an LLM pipeline:

- `inject` only → a *style guide* or *system prompt*. The capacitor never changes; it just shapes every output. (Preset: "Capacitor — style inject" with `style-guide.md`.)
- `absorb` only → a *log*. The model writes; the capacitor records. Good for "remember this for later" without the recorded text leaking back into the model's prompt this turn.
- `both` → a *scratchpad*. Inject what was last said, absorb what gets said now. This gets you a one-step-of-memory chat across runs without inventing a database.

The blog-worthy moment was realizing that the seeded markdown file is exactly the right level of detail for "what does this memory contain at t=0?" — it's editable, version-controllable, and obviously human-written. And the localStorage persistence keeps the playground feeling like a circuit you wired up: it's still there when you come back.

## Inductors: the reluctant cousin

Inductors resist change in current. The closest LLM analogue I could find was *resistance to variance*: take an ambiguous prompt where a small model answers differently each time you run it, and stabilize it.

The implementation is dumb in the right way: an inductor in front of a model node runs that model N times (default 3), then asks the judge LLM "which of these is the consensus?" — same `combineVote` step the parallel branches already use. You can drop one in front of Llama 3.2 3B, ask "Is a tomato a fruit?", and watch the variance collapse.

Doesn't replace temperature 0. Does help when temperature 0 isn't enough.

## Where the analogy holds

A few things genuinely do compose the way the diagram suggests.

- **Composition is associative**: chaining (A → B) → C behaves the same as A → (B → C) under `chain-ensemble`. Easy to verify, and not nothing — many pipeline frameworks fail this.
- **Bigger model, more "drop"**: in `physics` mode, putting a 70B in series adds visibly more latency and more rewriting per stage than an 8B. The R-as-cost intuition lands.
- **Conductance-weighted parallel** — splitting a token budget by 1/R is the most fun part of the demo. It's a real limit. It's also the right limit. A 3B model paired in parallel with a 70B gets most of the budget, which feels backwards until you remember that's literally how a current divider works.

## Where it breaks

This is the more interesting list.

- **There is no Ohm's law.** Voltage drop across a resistor is V = IR. There is no analogous quantity for "how much prompt got consumed by an LLM." A model doesn't lose tokens proportionally to its size; it transforms them.
- **Sources combine non-trivially.** Two voltage sources in parallel are usually a bug. Two prompts going into the same LLM are routine. The analogy can't survive multiple inputs without a story for "what does it mean to short two different prompts together?"
- **No conservation law.** Current in equals current out, in a real circuit. Tokens out are not constrained by tokens in for an LLM. This is exactly why "ensembles" make sense in the LLM world and don't in the resistor world.
- **Time matters here, doesn't there.** A capacitor's *physics* is its time response — RC charging curves, frequency domain. We're using it as a snapshot store, which is pedagogically helpful but throws out 90% of why a capacitor is interesting.
- **The judge is everywhere.** In `chain-ensemble` and `refine-vote`, every parallel join is *another* LLM. There's no electrical equivalent of "and now an op-amp arbitrates." That part is just a hack to make the analogy reach the finish line.

So the diagram is a *teaching* abstraction, not a *predictive* one. It earns its keep when it forces you to ask "wait — what does parallel even mean here?" — and the playground is structured so that the same circuit answers that question three different ways depending on the mode you pick.

## Implementation

The whole thing fits in one Cloudflare Worker. The Astro adapter builds the React Flow canvas as a client island and emits a single Worker entry that serves static assets and exposes:

- `POST /api/run` — body is `{ circuit, mode, prompt, capStates, seeds }`. The Worker validates the topology (single source/sink, fork/join only, no cycles, capacitors only in series), then walks the stages and dispatches each one through `env.AI.run(...)`. Capacitor effects are scheduled forward and applied around the next stage. The response carries the per-node trace, the final output, and any updated capacitor states.
- `GET /api/capacitors` — reads the markdown content collection and serves the seed bodies to the front-end so the React island can show them in the dropdown.

`wrangler.toml` declares `[ai] binding = "AI", remote = true`. With remote bindings on, even `wrangler dev` calls the real Workers AI service — there's no mock layer to drift out of sync.

The front-end stores everything you do in the URL hash and in `localStorage`. The hash is a base64url-encoded `{v:1, c:<circuit>}`, so every state of the playground is a shareable link. Capacitor state is intentionally *not* in the link — sharing transports the wiring, not your memory.

## Limits and what's next

- Right now the front-end calls `/api/run` and waits for a single JSON blob. Streaming per-node updates over SSE would make the canvas light up node-by-node as it runs, which is the most obvious next thing to do.
- A "transient analysis" mode — run the same prompt N times through a circuit with a capacitor and *plot* the capacitor's stored text length vs. step. It would give the analogy back its time-domain story.
- Diodes (one-way gates) and switches (tool-routers) are the next two components I'd add. Op-amps would be agents with feedback loops.
- The persistence format is versioned (`v:1`) so old share links can keep working even when the schema changes.

## How to try it

```bash
git clone https://github.com/diogodebastos/llm-circuits
cd llm-circuits
npm install
npm run wrangler:remote
```

Open the playground, hit "2 LLMs in parallel," type a question, and switch between the three modes. Then drop a capacitor in front of an LLM, run it twice, and watch the second answer reference the first. Then add an inductor and ask the 3B model something ambiguous.

The point isn't that LLMs are resistors. They aren't. The point is that two-terminal components are a *cheap* way to talk about composition, and we don't have many other cheap ways. The places this analogy breaks aren't bugs in the analogy — they're the actual ways LLM systems are different from physical ones, and noticing them by playing with a wiring diagram beats reading another taxonomy.
