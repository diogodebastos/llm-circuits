import { describe, it, expect } from "vitest";
import { executeCircuit } from "../execute";
import type { Circuit } from "../graph";

interface AiCall { model: string; prompt: string }

function stubRunner(reply: (model: string, prompt: string) => string) {
  const calls: AiCall[] = [];
  return {
    calls,
    run: async (model: string, input: { messages: Array<{ content: string }> }) => {
      const prompt = input.messages[0]?.content ?? "";
      calls.push({ model, prompt });
      return { response: reply(model, prompt) };
    },
  };
}

const M = "@cf/meta/llama-3.1-8b-instruct";

describe("executeCircuit: diode", () => {
  it("regex pass forwards the input", async () => {
    const ai = stubRunner((_m, p) => `MODEL_OUT(${p.length})`);
    const circuit: Circuit = {
      nodes: [
        { kind: "model", id: "a", modelId: M },
        { kind: "diode", id: "d", gate: "regex", pattern: "MODEL", onFail: "block" },
        { kind: "model", id: "b", modelId: M },
      ],
      edges: [
        { id: "a-d", source: "a", target: "d" },
        { id: "d-b", source: "d", target: "b" },
      ],
    };
    const r = await executeCircuit(ai, circuit, "physics", "hi");
    expect(r.ok).toBe(true);
    const dTrace = r.trace.find((t) => t.nodeId === "d")!;
    expect(dTrace.output).toMatch(/pass/);
  });

  it("regex block silences downstream model", async () => {
    const ai = stubRunner(() => "VALID_LONG_OUTPUT");
    const circuit: Circuit = {
      nodes: [
        { kind: "model", id: "a", modelId: M },
        { kind: "diode", id: "d", gate: "regex", pattern: "WILL_NEVER_MATCH_xyz", onFail: "block" },
        { kind: "model", id: "b", modelId: M },
      ],
      edges: [
        { id: "a-d", source: "a", target: "d" },
        { id: "d-b", source: "d", target: "b" },
      ],
    };
    const r = await executeCircuit(ai, circuit, "physics", "hi");
    expect(r.ok).toBe(true);
    const dTrace = r.trace.find((t) => t.nodeId === "d")!;
    expect(dTrace.output).toMatch(/blocked/);
  });

  it("passthrough mode forwards input even on fail", async () => {
    const ai = stubRunner(() => "ANY_MODEL_RESPONSE");
    const circuit: Circuit = {
      nodes: [
        { kind: "model", id: "a", modelId: M },
        { kind: "diode", id: "d", gate: "regex", pattern: "ZZZZ", onFail: "passthrough" },
        { kind: "model", id: "b", modelId: M },
      ],
      edges: [
        { id: "a-d", source: "a", target: "d" },
        { id: "d-b", source: "d", target: "b" },
      ],
    };
    const r = await executeCircuit(ai, circuit, "physics", "hi");
    const dTrace = r.trace.find((t) => t.nodeId === "d")!;
    expect(dTrace.output).toMatch(/passthrough/);
    // model b should have run (its trace has prompt and output)
    const bTrace = r.trace.find((t) => t.nodeId === "b")!;
    expect(bTrace.status).toBe("done");
  });
});

describe("executeCircuit: transformer", () => {
  it("prefixes instruction to input", async () => {
    const ai = stubRunner((_m, p) => `T:${p}`);
    const circuit: Circuit = {
      nodes: [
        { kind: "model", id: "a", modelId: M },
        { kind: "transformer", id: "t", instruction: "REWRITE", modelId: M },
        { kind: "model", id: "b", modelId: M },
      ],
      edges: [
        { id: "a-t", source: "a", target: "t" },
        { id: "t-b", source: "t", target: "b" },
      ],
    };
    await executeCircuit(ai, circuit, "physics", "user prompt");
    // Find the transformer's call: it should contain the instruction string.
    expect(ai.calls.some((c) => c.prompt.includes("REWRITE"))).toBe(true);
  });
});

describe("executeCircuit: capacitor inject + absorb", () => {
  it("injects context then absorbs the next output", async () => {
    const ai = stubRunner((_m, p) => `[answer to: ${p.slice(0, 20)}]`);
    const circuit: Circuit = {
      nodes: [
        { kind: "capacitor", id: "cap", seedSlug: "scratch", mode: "both" },
        { kind: "model", id: "m", modelId: M },
      ],
      edges: [{ id: "cap-m", source: "cap", target: "m" }],
    };
    const r = await executeCircuit(ai, circuit, "physics", "ask Q", {}, { scratch: "PRE_TEXT" });
    expect(r.ok).toBe(true);
    // After absorb, capStates should hold the new model output.
    expect(r.capStates?.cap).toMatch(/answer to/);
    // And the model's prompt should have been wrapped with PRE_TEXT context.
    const mCall = ai.calls.find((c) => c.prompt.includes("PRE_TEXT"));
    expect(mCall).toBeTruthy();
  });
});

describe("executeCircuit: ground filters branches", () => {
  it("grounded branch is dropped from physics combine", async () => {
    const ai = stubRunner((_m, p) => `[${p.slice(0, 12)}]`);
    const circuit: Circuit = {
      nodes: [
        { kind: "model", id: "src", modelId: M },
        { kind: "model", id: "a", modelId: M },
        { kind: "ground", id: "g" },
        { kind: "model", id: "j", modelId: M },
      ],
      edges: [
        { id: "s-a", source: "src", target: "a" },
        { id: "s-g", source: "src", target: "g" },
        { id: "a-j", source: "a", target: "j" },
        { id: "g-j", source: "g", target: "j" },
      ],
    };
    const r = await executeCircuit(ai, circuit, "physics", "Q");
    expect(r.ok).toBe(true);
    expect(r.finalOutput).toBeTruthy();
    // grounded trace marker
    const gTrace = r.trace.find((t) => t.nodeId === "g")!;
    expect(gTrace.output).toMatch(/silenced/);
  });
});
