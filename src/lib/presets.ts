import type { Circuit } from "./graph";

export const PRESETS: Record<string, { label: string; circuit: Circuit }> = {
  series2: {
    label: "LLMs in series",
    circuit: {
      nodes: [
        { kind: "model", id: "a", modelId: "@cf/meta/llama-3.1-8b-instruct", position: { x: 60, y: 160 } },
        { kind: "model", id: "b", modelId: "@cf/qwen/qwq-32b", position: { x: 400, y: 160 } },
      ],
      edges: [{ id: "a-b", source: "a", target: "b" }],
    },
  },
  parallel2: {
    label: "LLMs in parallel",
    circuit: {
      nodes: [
        { kind: "model", id: "src", modelId: "@cf/meta/llama-3.1-8b-instruct", position: { x: 40, y: 200 } },
        { kind: "model", id: "p1", modelId: "@cf/google/gemma-3-12b-it", position: { x: 380, y: 0 } },
        { kind: "model", id: "p2", modelId: "@cf/mistralai/mistral-small-3.1-24b-instruct", position: { x: 380, y: 400 } },
        { kind: "model", id: "snk", modelId: "@cf/meta/llama-3.1-8b-instruct", position: { x: 720, y: 200 } },
      ],
      edges: [
        { id: "src-p1", source: "src", target: "p1" },
        { id: "src-p2", source: "src", target: "p2" },
        { id: "p1-snk", source: "p1", target: "snk" },
        { id: "p2-snk", source: "p2", target: "snk" },
      ],
    },
  },
  scratchpadMemory: {
    label: "Capacitor: memory",
    // Scratchpad in inject+absorb mode: the LLM's previous answer gets stored
    // and re-injected on the next run. Apply two prompts in sequence (e.g.
    // "what is photosynthesis?" then "give me an analogy for that") and watch
    // the second answer reference the first.
    circuit: {
      nodes: [
        { kind: "capacitor", id: "cap", seedSlug: "scratchpad", mode: "both", position: { x: 60, y: 160 } },
        { kind: "model", id: "m", modelId: "@cf/meta/llama-3.1-8b-instruct", position: { x: 400, y: 160 } },
      ],
      edges: [{ id: "cap-m", source: "cap", target: "m" }],
    },
  },
  styleInject: {
    label: "Capacitor: style inject",
    // Inject a style-guide capacitor before the LLM. Run the same vague prompt
    // with and without it to see the seed take effect. Inject-only: state never
    // changes, just shapes every answer.
    circuit: {
      nodes: [
        { kind: "capacitor", id: "cap", seedSlug: "style-guide", mode: "inject", position: { x: 60, y: 160 } },
        { kind: "model", id: "m", modelId: "@cf/qwen/qwq-32b", position: { x: 400, y: 160 } },
      ],
      edges: [{ id: "cap-m", source: "cap", target: "m" }],
    },
  },
  buildWebsite: {
    label: "Build a website",
    // Brief capacitor (inject) seeds an inductor-stabilized planner: 3 plan
    // candidates collapse via vote into one spec. Spec fans out to three
    // specialists (structure, styling, copy), a merge model fuses them, and
    // an iteration-memory capacitor (both) carries the previous draft into
    // the final render so follow-up prompts diff against it instead of
    // rewriting from scratch. Prompt with something like:
    // "a landing page for a tea shop".
    circuit: {
      nodes: [
        { kind: "capacitor", id: "brief", seedSlug: "website-brief", mode: "inject", position: { x: 40, y: 280 } },
        { kind: "inductor", id: "ind", runs: 3, position: { x: 380, y: 280 } },
        { kind: "model", id: "plan", modelId: "@cf/qwen/qwq-32b", position: { x: 720, y: 280 } },
        { kind: "model", id: "html", modelId: "@cf/meta/llama-3.1-8b-instruct", position: { x: 1060, y: 0 } },
        { kind: "model", id: "css", modelId: "@cf/google/gemma-3-12b-it", position: { x: 1060, y: 280 } },
        { kind: "model", id: "copy", modelId: "@cf/mistralai/mistral-small-3.1-24b-instruct", position: { x: 1060, y: 560 } },
        { kind: "model", id: "merge", modelId: "@cf/mistralai/mistral-small-3.1-24b-instruct", position: { x: 1400, y: 280 } },
        { kind: "capacitor", id: "memory", seedSlug: "website-iter", mode: "both", position: { x: 1740, y: 280 } },
        { kind: "model", id: "render", modelId: "@cf/qwen/qwq-32b", position: { x: 2080, y: 280 } },
      ],
      edges: [
        { id: "brief-ind", source: "brief", target: "ind" },
        { id: "ind-plan", source: "ind", target: "plan" },
        { id: "plan-html", source: "plan", target: "html" },
        { id: "plan-css", source: "plan", target: "css" },
        { id: "plan-copy", source: "plan", target: "copy" },
        { id: "html-merge", source: "html", target: "merge" },
        { id: "css-merge", source: "css", target: "merge" },
        { id: "copy-merge", source: "copy", target: "merge" },
        { id: "merge-memory", source: "merge", target: "memory" },
        { id: "memory-render", source: "memory", target: "render" },
      ],
    },
  },
};
