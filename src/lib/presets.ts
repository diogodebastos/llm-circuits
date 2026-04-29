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
  codeReview: {
    label: "Code review",
    // Three parallel branches receive the user's code in parallel. Each branch
    // pairs a role-specific brief capacitor (correctness / security / style)
    // with a different model family — diverse priors plus diverse weights.
    // Branches converge on a merge brief capacitor that feeds a merger model.
    // Reviewer/merge nodes set explicit maxTokens because the platform default
    // truncates code reviews mid-paragraph.
    circuit: {
      nodes: [
        { kind: "capacitor", id: "cap-correct", seedSlug: "code-review-correctness", mode: "inject", position: { x: 40, y: 40 } },
        { kind: "model", id: "correct", modelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", maxTokens: 4096, position: { x: 380, y: 40 } },

        { kind: "capacitor", id: "cap-security", seedSlug: "code-review-security", mode: "inject", position: { x: 40, y: 320 } },
        { kind: "model", id: "security", modelId: "@cf/mistralai/mistral-small-3.1-24b-instruct", maxTokens: 4096, position: { x: 380, y: 320 } },

        { kind: "capacitor", id: "cap-style", seedSlug: "code-review-style", mode: "inject", position: { x: 40, y: 600 } },
        { kind: "model", id: "style", modelId: "@cf/google/gemma-3-12b-it", maxTokens: 4096, position: { x: 380, y: 600 } },

        { kind: "capacitor", id: "cap-merge", seedSlug: "code-review-merge", mode: "inject", position: { x: 720, y: 320 } },
        { kind: "model", id: "merge", modelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", maxTokens: 8192, position: { x: 1060, y: 320 } },
      ],
      edges: [
        { id: "cap-correct-correct", source: "cap-correct", target: "correct" },
        { id: "cap-security-security", source: "cap-security", target: "security" },
        { id: "cap-style-style", source: "cap-style", target: "style" },

        { id: "correct-cap-merge", source: "correct", target: "cap-merge" },
        { id: "security-cap-merge", source: "security", target: "cap-merge" },
        { id: "style-cap-merge", source: "style", target: "cap-merge" },

        { id: "cap-merge-merge", source: "cap-merge", target: "merge" },
      ],
    },
  },
  bestOfFour: {
    label: "Best of four",
    // Four diverse models answer the same prompt in parallel. A judge brief
    // capacitor concatenates their answers and instructs a judge model to
    // return the single best answer verbatim — no merging, no editing.
    // Diverse priors + a strict pass-through judge = quality filter without
    // averaging away the winner.
    circuit: {
      nodes: [
        { kind: "model", id: "m1", modelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", maxTokens: 2048, position: { x: 40, y: 0 } },
        { kind: "model", id: "m2", modelId: "@cf/qwen/qwq-32b", maxTokens: 2048, position: { x: 40, y: 220 } },
        { kind: "model", id: "m3", modelId: "@cf/mistralai/mistral-small-3.1-24b-instruct", maxTokens: 2048, position: { x: 40, y: 440 } },
        { kind: "model", id: "m4", modelId: "@cf/google/gemma-3-12b-it", maxTokens: 2048, position: { x: 40, y: 660 } },

        { kind: "capacitor", id: "cap-judge", seedSlug: "best-of-n-judge", mode: "inject", position: { x: 380, y: 330 } },
        { kind: "model", id: "judge", modelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", maxTokens: 4096, position: { x: 720, y: 330 } },
      ],
      edges: [
        { id: "m1-cap-judge", source: "m1", target: "cap-judge" },
        { id: "m2-cap-judge", source: "m2", target: "cap-judge" },
        { id: "m3-cap-judge", source: "m3", target: "cap-judge" },
        { id: "m4-cap-judge", source: "m4", target: "cap-judge" },
        { id: "cap-judge-judge", source: "cap-judge", target: "judge" },
      ],
    },
  },
  buildWebsite: {
    label: "Build a website",
    // Brief capacitor (inject) seeds an inductor-stabilized planner: 3 plan
    // candidates collapse via vote into one spec. Spec fans out to three
    // specialists (structure, styling, copy), a merge model fuses them,
    // and the result goes directly to a final render model.
    // Prompt with something like: "a landing page for a tea shop".
    circuit: {
      nodes: [
        { kind: "capacitor", id: "brief", seedSlug: "website-brief", mode: "inject", position: { x: 40, y: 280 } },
        { kind: "inductor", id: "ind", runs: 3, position: { x: 380, y: 280 } },
        { kind: "model", id: "plan", modelId: "@cf/qwen/qwq-32b", position: { x: 720, y: 280 } },
        { kind: "model", id: "html", modelId: "@cf/meta/llama-3.1-8b-instruct", position: { x: 1060, y: 0 } },
        { kind: "model", id: "css", modelId: "@cf/google/gemma-3-12b-it", position: { x: 1060, y: 280 } },
        { kind: "model", id: "copy", modelId: "@cf/mistralai/mistral-small-3.1-24b-instruct", position: { x: 1060, y: 560 } },
        { kind: "model", id: "merge", modelId: "@cf/mistralai/mistral-small-3.1-24b-instruct", position: { x: 1400, y: 280 } },
        { kind: "model", id: "render", modelId: "@cf/qwen/qwq-32b", position: { x: 1740, y: 280 } },
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
        { id: "merge-render", source: "merge", target: "render" },
      ],
    },
  },
};
