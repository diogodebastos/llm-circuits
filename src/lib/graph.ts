export type CircuitMode = "chain-ensemble" | "refine-vote" | "physics";

export type CapacitorMode = "inject" | "absorb" | "both";

export type DiodeGate = "regex" | "judge";
export type DiodeOnFail = "block" | "passthrough";

interface NodeBase {
  id: string;
  position?: { x: number; y: number };
}

export interface ModelCircuitNode extends NodeBase {
  kind: "model";
  modelId: string;
  /** Optional per-node output cap. Falls back to mode default if unset. */
  maxTokens?: number;
}
export interface CapacitorCircuitNode extends NodeBase {
  kind: "capacitor";
  /** Slug of the seed markdown file, or 'blank' for a scratchpad. */
  seedSlug: string;
  mode: CapacitorMode;
  /** Eval-mode rubric capacitor — judge LLM scores final output against this. */
  role?: "memory" | "golden";
}
export interface InductorCircuitNode extends NodeBase {
  kind: "inductor";
  runs: number;
}
export interface DiodeCircuitNode extends NodeBase {
  kind: "diode";
  gate: DiodeGate;
  /** Required when gate === "regex". JS RegExp source. */
  pattern?: string;
  /** Required when gate === "judge". Yes/no rubric prompt. */
  rubric?: string;
  onFail: DiodeOnFail;
}
export interface TransformerCircuitNode extends NodeBase {
  kind: "transformer";
  instruction: string;
  modelId: string;
  maxTokens?: number;
}
export interface GroundCircuitNode extends NodeBase {
  kind: "ground";
}

export type CircuitNode =
  | ModelCircuitNode
  | CapacitorCircuitNode
  | InductorCircuitNode
  | DiodeCircuitNode
  | TransformerCircuitNode
  | GroundCircuitNode;

/** Node kinds that act as "endpoint" of a branch (produce or pass text). */
export const ENDPOINT_KINDS = new Set(["model", "diode", "transformer", "ground"]);
export function isEndpointKind(k: CircuitNode["kind"]): boolean {
  return ENDPOINT_KINDS.has(k);
}

export interface CircuitEdge {
  id: string;
  source: string;
  target: string;
}

export interface Circuit {
  nodes: CircuitNode[];
  edges: CircuitEdge[];
}

export interface ValidationError {
  ok: false;
  reason: string;
}

export interface ValidationOk {
  ok: true;
  source: string;
  sink: string;
  /**
   * Linear sequence of stages. A stage is either:
   *   - one node (series), or
   *   - parallel branch siblings sharing a fork node.
   * A parallel branch is a model node, optionally preceded by a single
   * capacitor that injects/absorbs only into/out of that branch.
   * Inductors only appear as `single` stages.
   */
  stages: Array<
    | { kind: "single"; node: string }
    | { kind: "parallel"; branches: Array<{ cap?: string; model: string }> }
  >;
}

export type Validation = ValidationOk | ValidationError;

/** Coerce raw / persisted node objects into the discriminated union (back-compat for v1 hashes). */
export function normalizeNode(raw: any): CircuitNode {
  if (raw?.kind === "capacitor") {
    const cap: CapacitorCircuitNode = {
      kind: "capacitor",
      id: String(raw.id),
      seedSlug: String(raw.seedSlug ?? "blank"),
      mode: (raw.mode as CapacitorMode) ?? "both",
      position: raw.position,
    };
    if (raw.role === "golden") cap.role = "golden";
    return cap;
  }
  if (raw?.kind === "inductor") {
    return {
      kind: "inductor",
      id: String(raw.id),
      runs: Number(raw.runs ?? 3),
      position: raw.position,
    };
  }
  if (raw?.kind === "diode") {
    return {
      kind: "diode",
      id: String(raw.id),
      gate: (raw.gate === "regex" ? "regex" : "judge") as DiodeGate,
      pattern: raw.pattern != null ? String(raw.pattern) : undefined,
      rubric: raw.rubric != null ? String(raw.rubric) : "Is this answer factually well-grounded? Reply YES or NO.",
      onFail: (raw.onFail === "passthrough" ? "passthrough" : "block") as DiodeOnFail,
      position: raw.position,
    };
  }
  if (raw?.kind === "transformer") {
    const t: TransformerCircuitNode = {
      kind: "transformer",
      id: String(raw.id),
      instruction: String(raw.instruction ?? "Reformat the following text in clear bullet points."),
      modelId: String(raw.modelId ?? "@cf/meta/llama-3.1-8b-instruct"),
      position: raw.position,
    };
    if (raw.maxTokens != null) {
      const n = Number(raw.maxTokens);
      if (Number.isFinite(n) && n > 0) t.maxTokens = n;
    }
    return t;
  }
  if (raw?.kind === "ground") {
    return {
      kind: "ground",
      id: String(raw.id),
      position: raw.position,
    };
  }
  const node: ModelCircuitNode = {
    kind: "model",
    id: String(raw.id),
    modelId: String(raw.modelId),
    position: raw.position,
  };
  if (raw?.maxTokens != null) {
    const n = Number(raw.maxTokens);
    if (Number.isFinite(n) && n > 0) node.maxTokens = n;
  }
  return node;
}

export function normalizeCircuit(raw: any): Circuit {
  return {
    nodes: (raw?.nodes ?? []).map(normalizeNode),
    edges: (raw?.edges ?? []).map((e: any) => ({
      id: String(e.id),
      source: String(e.source),
      target: String(e.target),
    })),
  };
}

function adjacency(c: Circuit) {
  const out = new Map<string, string[]>();
  const inn = new Map<string, string[]>();
  for (const n of c.nodes) {
    out.set(n.id, []);
    inn.set(n.id, []);
  }
  for (const e of c.edges) {
    if (!out.has(e.source) || !inn.has(e.target)) {
      throw new Error(`Edge references unknown node: ${e.source} -> ${e.target}`);
    }
    out.get(e.source)!.push(e.target);
    inn.get(e.target)!.push(e.source);
  }
  return { out, inn };
}

function hasCycle(c: Circuit): boolean {
  const { out } = adjacency(c);
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const n of c.nodes) color.set(n.id, WHITE);
  function visit(u: string): boolean {
    color.set(u, GRAY);
    for (const v of out.get(u) ?? []) {
      const cv = color.get(v);
      if (cv === GRAY) return true;
      if (cv === WHITE && visit(v)) return true;
    }
    color.set(u, BLACK);
    return false;
  }
  for (const n of c.nodes) {
    if (color.get(n.id) === WHITE && visit(n.id)) return true;
  }
  return false;
}

export function validate(c: Circuit): Validation {
  if (c.nodes.length === 0) return { ok: false, reason: "Empty circuit." };
  if (hasCycle(c)) return { ok: false, reason: "Cycle detected." };

  const { out, inn } = adjacency(c);
  const sources = c.nodes.filter((n) => (inn.get(n.id) ?? []).length === 0);
  const sinks = c.nodes.filter((n) => (out.get(n.id) ?? []).length === 0);
  if (sources.length === 0) return { ok: false, reason: "Need at least one source node." };
  if (sinks.length !== 1) return { ok: false, reason: "Need exactly one sink node." };

  const byId = new Map(c.nodes.map((n) => [n.id, n]));
  const stages: ValidationOk["stages"] = [];
  const sinkId = sinks[0]!.id;
  const visited = new Set<string>();
  let cursor: string;

  if (sources.length === 1) {
    cursor = sources[0]!.id;
  } else {
    // Multi-source: initial parallel stage. Each source is a parallel branch
    // (an endpoint kind, or a capacitor → endpoint). The user prompt is broadcast
    // to every branch. All branches must converge on one join node.
    const branches: Array<{ cap?: string; model: string }> = [];
    const joins = new Set<string>();
    for (const s of sources) {
      const sOut = out.get(s.id) ?? [];
      if (sOut.length !== 1) return { ok: false, reason: "Multi-source branch must have exactly one output." };
      if (isEndpointKind(s.kind)) {
        branches.push({ model: s.id });
        joins.add(sOut[0]!);
        visited.add(s.id);
      } else if (s.kind === "capacitor") {
        const next = sOut[0]!;
        const nextNode = byId.get(next);
        const nextIn = inn.get(next) ?? [];
        const nextOut = out.get(next) ?? [];
        if (!nextNode || !isEndpointKind(nextNode.kind)) {
          return { ok: false, reason: "Source capacitor must feed a model/diode/transformer." };
        }
        if (nextIn.length !== 1) return { ok: false, reason: "Branch endpoint must have exactly one input." };
        if (nextOut.length !== 1) return { ok: false, reason: "Branch endpoint must have exactly one output." };
        branches.push({ cap: s.id, model: next });
        joins.add(nextOut[0]!);
        visited.add(s.id);
        visited.add(next);
      } else {
        return { ok: false, reason: "Source must be a model, capacitor, diode, transformer, or ground." };
      }
    }
    if (joins.size !== 1) return { ok: false, reason: "Source branches must converge on a single join node." };
    const join = [...joins][0]!;
    const joinIn = inn.get(join) ?? [];
    if (joinIn.length !== branches.length) {
      return { ok: false, reason: "Join node has unexpected incoming edges." };
    }
    stages.push({ kind: "parallel", branches });
    cursor = join;
  }

  while (true) {
    if (visited.has(cursor)) return { ok: false, reason: "Unsupported topology (revisit)." };
    visited.add(cursor);

    const successors = out.get(cursor) ?? [];
    if (successors.length <= 1) {
      stages.push({ kind: "single", node: cursor });
      if (cursor === sinkId) break;
      const next = successors[0];
      if (!next) return { ok: false, reason: "Dangling node." };
      cursor = next;
      continue;
    }

    // Capacitors/inductors/grounds must be on series only — never as fork node.
    // Models, diodes, transformers may fan out.
    const here = byId.get(cursor);
    if (here && here.kind !== "model" && here.kind !== "diode" && here.kind !== "transformer") {
      return { ok: false, reason: `${here.kind} node cannot fan out.` };
    }

    stages.push({ kind: "single", node: cursor });
    const branchNodes = successors;
    const branches: Array<{ cap?: string; model: string }> = [];
    const joins = new Set<string>();
    for (const b of branchNodes) {
      const bOut = out.get(b) ?? [];
      const bIn = inn.get(b) ?? [];
      if (bIn.length !== 1) return { ok: false, reason: "Parallel branch has extra inputs." };
      if (bOut.length !== 1) return { ok: false, reason: "Parallel branch must have exactly one output." };
      const bn = byId.get(b);
      if (!bn) return { ok: false, reason: "Branch references unknown node." };
      if (isEndpointKind(bn.kind)) {
        branches.push({ model: b });
        joins.add(bOut[0]!);
        visited.add(b);
      } else if (bn.kind === "capacitor") {
        const next = bOut[0]!;
        const nextNode = byId.get(next);
        const nextIn = inn.get(next) ?? [];
        const nextOut = out.get(next) ?? [];
        if (!nextNode || !isEndpointKind(nextNode.kind)) {
          return { ok: false, reason: "Capacitor in parallel branch must be followed by a model/diode/transformer." };
        }
        if (nextIn.length !== 1) return { ok: false, reason: "Branch endpoint must have exactly one input." };
        if (nextOut.length !== 1) return { ok: false, reason: "Branch endpoint must have exactly one output." };
        branches.push({ cap: b, model: next });
        joins.add(nextOut[0]!);
        visited.add(b);
        visited.add(next);
      } else {
        return { ok: false, reason: "Parallel branch must start with a model/diode/transformer or capacitor." };
      }
    }
    if (joins.size !== 1) return { ok: false, reason: "Parallel branches must converge on a single join node." };
    stages.push({ kind: "parallel", branches });
    const join = [...joins][0]!;
    const joinIn = inn.get(join) ?? [];
    if (joinIn.length !== branches.length) {
      return { ok: false, reason: "Join node has unexpected incoming edges." };
    }
    cursor = join;
  }

  // An inductor must be immediately followed by a model node:
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i]!;
    if (s.kind !== "single") continue;
    const node = byId.get(s.node);
    if (node?.kind === "inductor") {
      const next = stages[i + 1];
      if (!next || next.kind !== "single") {
        return { ok: false, reason: "Inductor must be followed by a single model node." };
      }
      const nextNode = byId.get(next.node);
      if (nextNode?.kind !== "model") {
        return { ok: false, reason: "Inductor must be followed by a model node." };
      }
    }
  }

  return { ok: true, source: sources[0]!.id, sink: sinkId, stages };
}
