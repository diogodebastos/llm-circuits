import type { Circuit } from "./graph";

export interface McpToolSpec {
  $schema: "llm-circuits/mcp-tool-v1";
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: { prompt: { type: "string"; description: string } };
    required: ["prompt"];
  };
  outputSchema: {
    type: "object";
    properties: { output: { type: "string" }; rTotal: { type: "number" } };
  };
  circuit: Circuit;
  runtime: {
    endpoint: "/api/run";
    mode: "physics" | "refine-vote" | "chain-ensemble";
  };
}

export function exportAsMcpTool(circuit: Circuit, name = "llm-circuit", description = "Custom LLM circuit"): McpToolSpec {
  return {
    $schema: "llm-circuits/mcp-tool-v1",
    name,
    description,
    inputSchema: {
      type: "object",
      properties: { prompt: { type: "string", description: "User prompt to feed the circuit." } },
      required: ["prompt"],
    },
    outputSchema: {
      type: "object",
      properties: { output: { type: "string" }, rTotal: { type: "number" } },
    },
    circuit,
    runtime: { endpoint: "/api/run", mode: "physics" },
  };
}

export function downloadMcpToolSpec(spec: McpToolSpec) {
  const blob = new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${spec.name}.mcp.json`;
  a.click();
  URL.revokeObjectURL(url);
}
