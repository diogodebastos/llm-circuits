import type { Circuit, CircuitMode } from "./graph";

export interface CfCreds {
  accountId: string;
  apiToken: string;
}

export interface RunRequest {
  circuit: Circuit;
  mode: CircuitMode;
  prompt: string;
  capStates?: Record<string, string>;
  seeds?: Record<string, string>;
  cfCreds?: CfCreds;
}

export interface NodeTrace {
  nodeId: string;
  modelId?: string;
  kind?: "model" | "capacitor" | "inductor" | "diode" | "transformer" | "ground";
  status: "pending" | "running" | "done" | "error";
  prompt?: string;
  output?: string;
  error?: string;
  R?: number;
  maxTokens?: number;
}

export interface CallTelemetryEntry {
  model: string;
  ms: number;
  cached?: boolean;
  neurons?: number;
  logId?: string;
}

export interface RunTelemetry {
  calls: number;
  ms: number;
  cached: number;
  gatewayUsed: boolean;
  perCall: CallTelemetryEntry[];
}

export interface EvalResult {
  score: number;
  rationale: string;
  goldenCapId: string;
}

export interface RunResponse {
  ok: boolean;
  finalOutput?: string;
  rTotal?: number;
  trace: NodeTrace[];
  capStates?: Record<string, string>;
  error?: string;
  telemetry?: RunTelemetry;
  evalResult?: EvalResult;
}

export async function runCircuit(
  req: RunRequest,
  onNodeUpdate?: (trace: NodeTrace) => void,
  cfCreds?: CfCreds
): Promise<RunResponse> {
  const res = await fetch("/api/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cfCreds ? { ...req, cfCreds } : req),
  });
  if (!res.ok) {
    return { ok: false, trace: [], error: `HTTP ${res.status}: ${await res.text()}` };
  }

  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop()!;
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const evt = JSON.parse(line.slice(6)) as { type: string; trace?: NodeTrace; result?: RunResponse };
        if (evt.type === "node" && evt.trace && onNodeUpdate) {
          onNodeUpdate(evt.trace);
        } else if (evt.type === "done" && evt.result) {
          return evt.result;
        }
      } catch {
        // malformed SSE line — skip
      }
    }
  }

  return { ok: false, trace: [], error: "Stream ended without result" };
}
