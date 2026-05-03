import type { Circuit } from "./graph";

export const PRESETS: Record<string, { label: string; prompt?: string; circuit: Circuit }> = {
  series2: {
    label: "LLMs in series",
    prompt: "Explain why the sky is blue in two sentences.",
    circuit: {
      nodes: [
        { kind: "model", id: "a", modelId: "@cf/meta/llama-3.1-8b-instruct", position: { x: 60, y: 160 } },
        { kind: "model", id: "b", modelId: "@cf/meta/llama-3.1-8b-instruct", position: { x: 400, y: 160 } },
      ],
      edges: [{ id: "a-b", source: "a", target: "b" }],
    },
  },
  parallel2: {
    label: "LLMs in parallel",
    prompt: "List three surprising facts about octopuses.",
    circuit: {
      nodes: [
        { kind: "model", id: "src", modelId: "@cf/meta/llama-3.1-8b-instruct", position: { x: 40, y: 200 } },
        { kind: "model", id: "p1", modelId: "@cf/google/gemma-3-12b-it", position: { x: 380, y: 0 } },
        { kind: "model", id: "p2", modelId: "@cf/meta/llama-3.1-8b-instruct", position: { x: 380, y: 400 } },
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
    prompt: "What is photosynthesis?",
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
    prompt: "Describe the ocean.",
    // Inject a style-guide capacitor before the LLM. Run the same vague prompt
    // with and without it to see the seed take effect. Inject-only: state never
    // changes, just shapes every answer.
    circuit: {
      nodes: [
        { kind: "capacitor", id: "cap", seedSlug: "style-guide", mode: "inject", position: { x: 60, y: 160 } },
        { kind: "model", id: "m", modelId: "@cf/meta/llama-3.1-8b-instruct", position: { x: 400, y: 160 } },
      ],
      edges: [{ id: "cap-m", source: "cap", target: "m" }],
    },
  },
  codeReview: {
    label: "Code review",
    prompt: `Review this code:

\`\`\`js
function getUserDiscount(userId, cartTotal) {
    const sql = "SELECT tier FROM users WHERE id = " + userId;
    const tier = db.queryRaw(sql)[0].tier;

    let discount = 0
    if (tier == "gold") discount = 0.2
    else if (tier = "silver") discount = 0.1

    const password = "admin123";
    console.log("Applying discount for user " + userId + " pw=" + password);

    for (var i = 0; i <= cartTotal.items.length; i++) {
        cartTotal.items[i].price = cartTotal.items[i].price * (1 - discount);
    }

    return cartTotal;
}
\`\`\``,
    // Three parallel branches receive the user's code in parallel. Each branch
    // pairs a role-specific brief capacitor (correctness / security / style)
    // with a different model family — diverse priors plus diverse weights.
    // Branches converge on a merge brief capacitor that feeds a merger model.
    // Reviewer/merge nodes set explicit maxTokens because the platform default
    // truncates code reviews mid-paragraph.
    circuit: {
      nodes: [
        { kind: "capacitor", id: "cap-correct", seedSlug: "code-review-correctness", mode: "inject", position: { x: 40, y: 40 } },
        { kind: "model", id: "correct", modelId: "@cf/google/gemma-3-12b-it", maxTokens: 4096, position: { x: 380, y: 40 } },

        { kind: "capacitor", id: "cap-security", seedSlug: "code-review-security", mode: "inject", position: { x: 40, y: 320 } },
        { kind: "model", id: "security", modelId: "@cf/meta/llama-3.1-8b-instruct", maxTokens: 4096, position: { x: 380, y: 320 } },

        { kind: "capacitor", id: "cap-style", seedSlug: "code-review-style", mode: "inject", position: { x: 40, y: 600 } },
        { kind: "model", id: "style", modelId: "@cf/google/gemma-3-12b-it", maxTokens: 4096, position: { x: 380, y: 600 } },

        { kind: "capacitor", id: "cap-merge", seedSlug: "code-review-merge", mode: "inject", position: { x: 720, y: 320 } },
        { kind: "model", id: "merge", modelId: "@cf/google/gemma-3-12b-it", maxTokens: 8192, position: { x: 1060, y: 320 } },
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
    prompt: "Write a short, vivid haiku about debugging code at 3am.",
    // Four diverse models answer the same prompt in parallel. A judge brief
    // capacitor concatenates their answers and instructs a judge model to
    // return the single best answer verbatim — no merging, no editing.
    // Diverse priors + a strict pass-through judge = quality filter without
    // averaging away the winner.
    circuit: {
      nodes: [
        { kind: "model", id: "m1", modelId: "@cf/google/gemma-3-12b-it", maxTokens: 2048, position: { x: 40, y: 0 } },
        { kind: "model", id: "m2", modelId: "@cf/meta/llama-3.1-8b-instruct", maxTokens: 2048, position: { x: 40, y: 220 } },
        { kind: "model", id: "m3", modelId: "@cf/meta/llama-3.1-8b-instruct", maxTokens: 2048, position: { x: 40, y: 440 } },
        { kind: "model", id: "m4", modelId: "@cf/google/gemma-3-12b-it", maxTokens: 2048, position: { x: 40, y: 660 } },

        { kind: "capacitor", id: "cap-judge", seedSlug: "best-of-n-judge", mode: "inject", position: { x: 380, y: 330 } },
        { kind: "model", id: "judge", modelId: "@cf/google/gemma-3-12b-it", maxTokens: 4096, position: { x: 720, y: 330 } },
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
  diodeGuarded: {
    label: "Diode: guarded chain",
    prompt: "Who painted the ceiling of the Sistine Chapel, and in what years?",
    // A small model answers; a judge-mode diode checks whether the answer is
    // factually grounded; pass → final model refines, fail → branch is blocked
    // and the run halts cleanly.
    circuit: {
      nodes: [
        { kind: "model", id: "drafter", modelId: "@cf/meta/llama-3.2-3b-instruct", position: { x: 40, y: 160 } },
        {
          kind: "diode",
          id: "gate",
          gate: "judge",
          rubric: "Is this answer specific, on-topic, and free of obvious hallucination? Reply YES or NO.",
          onFail: "block",
          position: { x: 380, y: 160 },
        },
        { kind: "model", id: "refiner", modelId: "@cf/google/gemma-3-12b-it", position: { x: 720, y: 160 } },
      ],
      edges: [
        { id: "drafter-gate", source: "drafter", target: "gate" },
        { id: "gate-refiner", source: "gate", target: "refiner" },
      ],
    },
  },
  transformerTranslate: {
    label: "Transformer: translate-then-judge",
    prompt: "Summarize the plot of Hamlet.",
    // Two parallel reviewer models answer in their own register; transformers
    // normalize each output to English bullet points; judge picks the best.
    circuit: {
      nodes: [
        { kind: "model", id: "src", modelId: "@cf/meta/llama-3.1-8b-instruct", position: { x: 40, y: 200 } },
        { kind: "transformer", id: "t1", instruction: "Rewrite the following as 3 short, plain-English bullet points. Reply with only the bullets.", modelId: "@cf/meta/llama-3.1-8b-instruct", position: { x: 380, y: 0 } },
        { kind: "transformer", id: "t2", instruction: "Rewrite the following as a single tight paragraph in plain English. Reply with only the paragraph.", modelId: "@cf/google/gemma-3-12b-it", position: { x: 380, y: 400 } },
        { kind: "model", id: "judge", modelId: "@cf/google/gemma-3-12b-it", position: { x: 720, y: 200 } },
      ],
      edges: [
        { id: "src-t1", source: "src", target: "t1" },
        { id: "src-t2", source: "src", target: "t2" },
        { id: "t1-judge", source: "t1", target: "judge" },
        { id: "t2-judge", source: "t2", target: "judge" },
      ],
    },
  },
  groundedVote: {
    label: "Ground: refusal-tolerant vote",
    prompt: "What causes a rainbow to form after rain?",
    // A source model drafts an answer. Three parallel judge-mode diodes each
    // check a different criterion (factual / on-topic / non-refusal). A diode
    // that fails grounds its branch out; survivors feed the final judge.
    circuit: {
      nodes: [
        { kind: "model", id: "src", modelId: "@cf/meta/llama-3.1-8b-instruct", position: { x: 40, y: 240 } },
        {
          kind: "diode",
          id: "g1",
          gate: "judge",
          rubric: "Is this answer factually grounded (no obvious hallucination)? Reply YES or NO.",
          onFail: "block",
          position: { x: 380, y: 0 },
        },
        {
          kind: "diode",
          id: "g2",
          gate: "judge",
          rubric: "Does this answer directly address the user's question? Reply YES or NO.",
          onFail: "block",
          position: { x: 380, y: 240 },
        },
        {
          kind: "diode",
          id: "g3",
          gate: "regex",
          pattern: "[a-z]{40,}",
          onFail: "block",
          position: { x: 380, y: 480 },
        },
        { kind: "model", id: "judge", modelId: "@cf/google/gemma-3-12b-it", position: { x: 720, y: 240 } },
      ],
      edges: [
        { id: "src-g1", source: "src", target: "g1" },
        { id: "src-g2", source: "src", target: "g2" },
        { id: "src-g3", source: "src", target: "g3" },
        { id: "g1-judge", source: "g1", target: "judge" },
        { id: "g2-judge", source: "g2", target: "judge" },
        { id: "g3-judge", source: "g3", target: "judge" },
      ],
    },
  },
  buildWebsite: {
    label: "Build a website",
    prompt: "a landing page for a tea shop",
    // Brief capacitor (inject) seeds an inductor-stabilized planner: 3 plan
    // candidates collapse via vote into one spec. Spec fans out to three
    // specialists (structure, styling, copy), a merge model fuses them,
    // and the result goes directly to a final render model.
    // Prompt with something like: "a landing page for a tea shop".
    circuit: {
      nodes: [
        { kind: "capacitor", id: "brief", seedSlug: "website-brief", mode: "inject", position: { x: 40, y: 280 } },
        { kind: "inductor", id: "ind", runs: 3, position: { x: 380, y: 280 } },
        { kind: "model", id: "plan", modelId: "@cf/meta/llama-3.1-8b-instruct", position: { x: 720, y: 280 } },
        { kind: "model", id: "html", modelId: "@cf/meta/llama-3.1-8b-instruct", position: { x: 1060, y: 0 } },
        { kind: "model", id: "css", modelId: "@cf/google/gemma-3-12b-it", position: { x: 1060, y: 280 } },
        { kind: "model", id: "copy", modelId: "@cf/meta/llama-3.1-8b-instruct", position: { x: 1060, y: 560 } },
        { kind: "model", id: "merge", modelId: "@cf/meta/llama-3.1-8b-instruct", position: { x: 1400, y: 280 } },
        { kind: "model", id: "render", modelId: "@cf/meta/llama-3.1-8b-instruct", position: { x: 1740, y: 280 } },
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
