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
    id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    label: "Llama 3.3 70B",
    paramsB: 70,
    R: 70,
    description: "Big resistor — slowest, strongest reasoning.",
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
