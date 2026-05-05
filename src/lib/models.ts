export interface ModelSpec {
  id: string;
  label: string;
  paramsB: number;
  /** Resistance, in ohms (made up — proportional to params). */
  R: number;
  description: string;
}

export const MODELS: ModelSpec[] = [
  {
    id: "@cf/moonshotai/kimi-k2.6",
    label: "Kimi K2.6 1T",
    paramsB: 1000,
    R: 1000,
    description: "Frontier-scale MoE — biggest resistor, top reasoning.",
  },
  {
    id: "@cf/nvidia/nemotron-3-120b-a12b",
    label: "Nemotron 3 120B (A12B)",
    paramsB: 120,
    R: 120,
    description: "Hybrid MoE — 120B total, 12B active.",
  },
  {
    id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    label: "Llama 3.3 70B",
    paramsB: 70,
    R: 70,
    description: "Big resistor — slowest, strongest reasoning.",
  },
  {
    id: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
    label: "DeepSeek R1 Distill 32B",
    paramsB: 32,
    R: 32,
    description: "R1 reasoning distilled into Qwen 2.5 32B.",
  },
  {
    id: "@cf/qwen/qwq-32b",
    label: "Qwen QwQ 32B",
    paramsB: 32,
    R: 32,
    description: "Reasoning-tuned mid-large model.",
  },
  {
    id: "@cf/google/gemma-3-12b-it",
    label: "Gemma 3 12B",
    paramsB: 12,
    R: 12,
    description: "Lightweight Google model.",
  },
  {
    id: "@cf/meta/llama-3.1-8b-instruct",
    label: "Llama 3.1 8B",
    paramsB: 8,
    R: 8,
    description: "Fast, balanced. Also used as judge in ensemble/vote modes.",
  },
  {
    id: "@cf/meta/llama-3.2-3b-instruct",
    label: "Llama 3.2 3B",
    paramsB: 3,
    R: 3,
    description: "Tiny resistor — quickest, lowest cost.",
  },
];

export const JUDGE_MODEL = "@cf/meta/llama-3.1-8b-instruct";

export function getModel(id: string): ModelSpec {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown model: ${id}`);
  return m;
}
