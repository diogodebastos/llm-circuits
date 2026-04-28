export type CircuitMode = "chain-ensemble" | "refine-vote" | "physics";

export type CapacitorMode = "inject" | "absorb" | "both";

interface NodeBase {
  id: string;
  position?: { x: number; y: number };
}

export interface ModelCircuitNode extends NodeBase {
  kind: "model";
  modelId: string;
}
export interface CapacitorCircuitNode extends NodeBase {
  kind: "capacitor";
  /** Slug of the seed markdown file, or 'blank' for a scratchpad. */
  seedSlug: string;
  mode: CapacitorMode;
}
export interface InductorCircuitNode extends NodeBase {
  kind: "inductor";
  runs: number;
}

export type CircuitNode = ModelCircuitNode | CapacitorCircuitNode | InductorCircuitNode;

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
   * Capacitors and inductors only appear as `single` stages.
   */
  stages: Array<{ kind: "single"; node: string } | { kind: "parallel"; nodes: string[] }>;
}

export type Validation = ValidationOk | ValidationError;

/** Coerce raw / persisted node objects into the discriminated union (back-compat for v1 hashes). */
export function normalizeNode(raw: any): CircuitNode {
  if (raw?.kind === "capacitor") {
    return {
      kind: "capacitor",
      id: String(raw.id),
      seedSlug: String(raw.seedSlug ?? "blank"),
      mode: (raw.mode as CapacitorMode) ?? "both",
      position: raw.position,
    };
  }
  if (raw?.kind === "inductor") {
    return {
      kind: "inductor",
      id: String(raw.id),
      runs: Number(raw.runs ?? 3),
      position: raw.position,
    };
  }
  return {
    kind: "model",
    id: String(raw.id),
    modelId: String(raw.modelId),
    position: raw.position,
  };
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
  if (sources.length !== 1) return { ok: false, reason: "Need exactly one source node." };
  if (sinks.length !== 1) return { ok: false, reason: "Need exactly one sink node." };

  const byId = new Map(c.nodes.map((n) => [n.id, n]));
  const stages: ValidationOk["stages"] = [];
  let cursor = sources[0]!.id;
  const sinkId = sinks[0]!.id;
  const visited = new Set<string>();

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

    // Capacitors/inductors must be on series only — never as fork node:
    const here = byId.get(cursor);
    if (here && here.kind !== "model") {
      return { ok: false, reason: `${here.kind} node cannot fan out.` };
    }

    stages.push({ kind: "single", node: cursor });
    const branchNodes = successors;
    const joins = new Set<string>();
    for (const b of branchNodes) {
      const bOut = out.get(b) ?? [];
      const bIn = inn.get(b) ?? [];
      if (bIn.length !== 1) return { ok: false, reason: "Parallel branch has extra inputs." };
      if (bOut.length !== 1) return { ok: false, reason: "Parallel branch must have exactly one output." };
      const bn = byId.get(b);
      if (bn && bn.kind !== "model") return { ok: false, reason: "Parallel branch must be a model node." };
      joins.add(bOut[0]!);
    }
    if (joins.size !== 1) return { ok: false, reason: "Parallel branches must converge on a single join node." };
    stages.push({ kind: "parallel", nodes: branchNodes });
    const join = [...joins][0]!;
    const joinIn = inn.get(join) ?? [];
    if (joinIn.length !== branchNodes.length) {
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
