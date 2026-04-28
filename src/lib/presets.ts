import type { Circuit } from "./graph";

export const PRESETS: Record<string, { label: string; circuit: Circuit }> = {
  series2: {
    label: "2 LLMs in series",
    circuit: {
      nodes: [
        { kind: "model", id: "a", modelId: "@cf/meta/llama-3.1-8b-instruct", position: { x: 60, y: 160 } },
        { kind: "model", id: "b", modelId: "@cf/qwen/qwq-32b", position: { x: 320, y: 160 } },
      ],
      edges: [{ id: "a-b", source: "a", target: "b" }],
    },
  },
  parallel2: {
    label: "2 LLMs in parallel",
    circuit: {
      nodes: [
        { kind: "model", id: "src", modelId: "@cf/meta/llama-3.1-8b-instruct", position: { x: 40, y: 160 } },
        { kind: "model", id: "p1", modelId: "@cf/google/gemma-3-12b-it", position: { x: 280, y: 60 } },
        { kind: "model", id: "p2", modelId: "@cf/mistralai/mistral-small-3.1-24b-instruct", position: { x: 280, y: 260 } },
        { kind: "model", id: "snk", modelId: "@cf/meta/llama-3.1-8b-instruct", position: { x: 540, y: 160 } },
      ],
      edges: [
        { id: "src-p1", source: "src", target: "p1" },
        { id: "src-p2", source: "src", target: "p2" },
        { id: "p1-snk", source: "p1", target: "snk" },
        { id: "p2-snk", source: "p2", target: "snk" },
      ],
    },
  },
  styleInject: {
    label: "Capacitor — style inject",
    // Inject a style-guide capacitor before the LLM. Run the same vague prompt
    // with and without it to see the seed take effect. Inject-only: state never
    // changes, just shapes every answer.
    circuit: {
      nodes: [
        { kind: "capacitor", id: "cap", seedSlug: "style-guide", mode: "inject", position: { x: 60, y: 160 } },
        { kind: "model", id: "m", modelId: "@cf/qwen/qwq-32b", position: { x: 320, y: 160 } },
      ],
      edges: [{ id: "cap-m", source: "cap", target: "m" }],
    },
  },
  scratchpadMemory: {
    label: "Capacitor — scratchpad memory",
    // Scratchpad in inject+absorb mode: the LLM's previous answer gets stored
    // and re-injected on the next run. Apply two prompts in sequence (e.g.
    // "what is photosynthesis?" then "give me an analogy for that") and watch
    // the second answer reference the first.
    circuit: {
      nodes: [
        { kind: "capacitor", id: "cap", seedSlug: "scratchpad", mode: "both", position: { x: 60, y: 160 } },
        { kind: "model", id: "m", modelId: "@cf/meta/llama-3.1-8b-instruct", position: { x: 320, y: 160 } },
      ],
      edges: [{ id: "cap-m", source: "cap", target: "m" }],
    },
  },
  inductorStable: {
    label: "Inductor — stabilize a small LLM",
    // Inductor x3 in front of a small model. On an ambiguous prompt the bare
    // 3B answer drifts run-to-run; with the inductor it self-votes and
    // converges on the most consistent response.
    circuit: {
      nodes: [
        { kind: "inductor", id: "ind", runs: 3, position: { x: 60, y: 160 } },
        { kind: "model", id: "m", modelId: "@cf/meta/llama-3.2-3b-instruct", position: { x: 320, y: 160 } },
      ],
      edges: [{ id: "ind-m", source: "ind", target: "m" }],
    },
  },
};
