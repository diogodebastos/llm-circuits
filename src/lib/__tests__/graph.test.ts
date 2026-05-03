import { describe, it, expect } from "vitest";
import { validate, type Circuit } from "../graph";
import { PRESETS } from "../presets";

const ok = (c: Circuit) => {
  const v = validate(c);
  if (!v.ok) throw new Error(`expected ok, got: ${v.reason}`);
  return v;
};
const bad = (c: Circuit) => {
  const v = validate(c);
  if (v.ok) throw new Error("expected validation failure");
  return v;
};

describe("validate(): presets", () => {
  for (const [key, preset] of Object.entries(PRESETS)) {
    it(`${key} validates`, () => {
      ok(preset.circuit);
    });
  }
});

describe("validate(): structural rules", () => {
  it("rejects empty circuit", () => {
    expect(bad({ nodes: [], edges: [] }).reason).toMatch(/empty/i);
  });

  it("rejects cycles", () => {
    const c: Circuit = {
      nodes: [
        { kind: "model", id: "a", modelId: "@cf/meta/llama-3.1-8b-instruct" },
        { kind: "model", id: "b", modelId: "@cf/meta/llama-3.1-8b-instruct" },
      ],
      edges: [
        { id: "ab", source: "a", target: "b" },
        { id: "ba", source: "b", target: "a" },
      ],
    };
    expect(bad(c).reason).toMatch(/cycle/i);
  });

  it("rejects multi-sink without convergence", () => {
    const c: Circuit = {
      nodes: [
        { kind: "model", id: "src", modelId: "@cf/meta/llama-3.1-8b-instruct" },
        { kind: "model", id: "a", modelId: "@cf/meta/llama-3.1-8b-instruct" },
        { kind: "model", id: "b", modelId: "@cf/meta/llama-3.1-8b-instruct" },
      ],
      edges: [
        { id: "src-a", source: "src", target: "a" },
        { id: "src-b", source: "src", target: "b" },
      ],
    };
    expect(bad(c).reason).toMatch(/sink/i);
  });

  it("rejects capacitor as fork node", () => {
    const c: Circuit = {
      nodes: [
        { kind: "capacitor", id: "cap", seedSlug: "blank", mode: "inject" },
        { kind: "model", id: "a", modelId: "@cf/meta/llama-3.1-8b-instruct" },
        { kind: "model", id: "b", modelId: "@cf/meta/llama-3.1-8b-instruct" },
        { kind: "model", id: "j", modelId: "@cf/meta/llama-3.1-8b-instruct" },
      ],
      edges: [
        { id: "cap-a", source: "cap", target: "a" },
        { id: "cap-b", source: "cap", target: "b" },
        { id: "a-j", source: "a", target: "j" },
        { id: "b-j", source: "b", target: "j" },
      ],
    };
    expect(bad(c).reason).toMatch(/cannot fan out/i);
  });

  it("rejects inductor not followed by a model", () => {
    const c: Circuit = {
      nodes: [
        { kind: "inductor", id: "ind", runs: 3 },
        { kind: "capacitor", id: "cap", seedSlug: "blank", mode: "inject" },
        { kind: "model", id: "m", modelId: "@cf/meta/llama-3.1-8b-instruct" },
      ],
      edges: [
        { id: "ind-cap", source: "ind", target: "cap" },
        { id: "cap-m", source: "cap", target: "m" },
      ],
    };
    expect(bad(c).reason).toMatch(/inductor/i);
  });
});

describe("validate(): new node kinds", () => {
  it("allows diode in series", () => {
    const c: Circuit = {
      nodes: [
        { kind: "model", id: "a", modelId: "@cf/meta/llama-3.1-8b-instruct" },
        { kind: "diode", id: "d", gate: "regex", pattern: ".*", onFail: "block" },
        { kind: "model", id: "b", modelId: "@cf/meta/llama-3.1-8b-instruct" },
      ],
      edges: [
        { id: "a-d", source: "a", target: "d" },
        { id: "d-b", source: "d", target: "b" },
      ],
    };
    ok(c);
  });

  it("allows diodes in parallel branches", () => {
    const c: Circuit = {
      nodes: [
        { kind: "model", id: "src", modelId: "@cf/meta/llama-3.1-8b-instruct" },
        { kind: "diode", id: "d1", gate: "regex", pattern: ".*", onFail: "block" },
        { kind: "diode", id: "d2", gate: "regex", pattern: ".*", onFail: "block" },
        { kind: "model", id: "j", modelId: "@cf/meta/llama-3.1-8b-instruct" },
      ],
      edges: [
        { id: "s1", source: "src", target: "d1" },
        { id: "s2", source: "src", target: "d2" },
        { id: "j1", source: "d1", target: "j" },
        { id: "j2", source: "d2", target: "j" },
      ],
    };
    ok(c);
  });

  it("allows transformer as branch endpoint", () => {
    const c: Circuit = {
      nodes: [
        { kind: "model", id: "src", modelId: "@cf/meta/llama-3.1-8b-instruct" },
        { kind: "transformer", id: "t", instruction: "translate", modelId: "@cf/meta/llama-3.1-8b-instruct" },
        { kind: "model", id: "snk", modelId: "@cf/meta/llama-3.1-8b-instruct" },
      ],
      edges: [
        { id: "s-t", source: "src", target: "t" },
        { id: "t-snk", source: "t", target: "snk" },
      ],
    };
    ok(c);
  });
});
