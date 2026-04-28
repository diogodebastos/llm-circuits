---
title: "LLMs as Resistors: A Circuit Analogy"
description: "Wiring language models in series and parallel — does the analogy hold up?"
pubDate: 2026-04-28
draft: true
---

> **Stub.** Full writeup pending. Outline below.

## 1. Intro

Why build it? — circuits are intuitive (two terminals, current flows, you compose them). LLM pipelines are not. Could the analogy borrow some intuition?

## 2. The analogy

- **Voltage → prompt.** The signal applied to the network.
- **Resistor → model.** A component that transforms the signal at some "cost."
- **Resistance → model size / cost.** Bigger model = more resistance = more compute per unit of current.
- **Series → chain.** Output of one becomes input of the next.
- **Parallel → ensemble.** Same input to all branches; outputs combine at the join node.

## 3. Three interpretation modes

The same wire diagram can mean different things. The playground exposes three:

1. **chain-ensemble** — series chains text; parallel synthesizes via judge LLM.
2. **refine-vote** — series asks each next model to refine the prior answer; parallel votes for consensus.
3. **physics-faithful** — parallel branches split a token budget by conductance (1/R), so smaller models get more of the budget. R<sub>total</sub> is computed and shown.

## 4. Findings (TBD after running experiments)

- Where does the analogy hold? (Composition, monotonicity of "resistance".)
- Where does it break? (Non-linearity of LLMs; "voltage drop" is not well-defined; ensembles don't really sum currents.)

## 5. Limits & future work

- Capacitors / inductors → memory and state. A KV-cache-as-capacitor sketch.
- Diodes → tool gates / routers.
- Op-amps → agents with feedback loops.

## 6. How to run it

Cloudflare Workers + Workers AI. Astro static front-end, React Flow canvas, single Worker route `/api/run` dispatches to the `AI` binding. Source: see repo.
