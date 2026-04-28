import type { Circuit, CircuitMode } from "./graph";

export interface RunRequest {
  circuit: Circuit;
  mode: CircuitMode;
  prompt: string;
  /** Current capacitor states from client (nodeId -> stored text). */
  capStates?: Record<string, string>;
  /** Seed bodies (slug -> body) so the worker can fall back when LS is empty. */
  seeds?: Record<string, string>;
}

export interface NodeTrace {
  nodeId: string;
  modelId?: string;
  kind?: "model" | "capacitor" | "inductor";
  status: "pending" | "running" | "done" | "error";
  prompt?: string;
  output?: string;
  error?: string;
  R?: number;
  maxTokens?: number;
}

export interface RunResponse {
  ok: boolean;
  finalOutput?: string;
  rTotal?: number;
  trace: NodeTrace[];
  /** Updated capacitor states after the run (only those that changed). */
  capStates?: Record<string, string>;
  error?: string;
}

export async function runCircuit(req: RunRequest): Promise<RunResponse> {
  const res = await fetch("/api/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    return { ok: false, trace: [], error: `HTTP ${res.status}: ${await res.text()}` };
  }
  return (await res.json()) as RunResponse;
}
