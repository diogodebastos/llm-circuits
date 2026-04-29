import { JUDGE_MODEL, getModel } from "./models";
import { validate, type Circuit, type CircuitMode } from "./graph";
import type { NodeTrace, RunResponse } from "./runner";

interface AiRunner {
  run: (model: string, input: { messages: Array<{ role: string; content: string }>; max_tokens?: number }) => Promise<unknown>;
}

function asText(out: unknown): string {
  if (typeof out === "string") return out;
  if (out && typeof out === "object") {
    const o = out as Record<string, unknown>;
    if (typeof o.response === "string") return o.response;
    if (typeof o.result === "string") return o.result;
    if (Array.isArray((o as { choices?: unknown }).choices)) {
      const c = (o as { choices: Array<{ message?: { content?: string } }> }).choices[0];
      if (c?.message?.content) return c.message.content;
    }
  }
  return JSON.stringify(out);
}

async function callModel(ai: AiRunner, modelId: string, prompt: string, maxTokens?: number): Promise<string> {
  const out = await ai.run(modelId, {
    messages: [{ role: "user", content: prompt }],
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
  });
  return asText(out).trim();
}

function refinePrompt(prev: string): string {
  return `Refine and improve the following answer. Keep what is correct, fix mistakes, and add missing context. Reply with only the improved answer.\n\nANSWER:\n${prev}`;
}

async function combineEnsemble(ai: AiRunner, originalPrompt: string, branchOutputs: string[]): Promise<string> {
  const prompt =
    `You are a judge. Given the user's question and several candidate answers, synthesize the single best answer. Quote facts only if they appear in at least one candidate.\n\n` +
    `QUESTION:\n${originalPrompt}\n\n` +
    branchOutputs.map((o, i) => `CANDIDATE ${i + 1}:\n${o}`).join("\n\n") +
    `\n\nFINAL ANSWER:`;
  return callModel(ai, JUDGE_MODEL, prompt);
}

async function combineVote(ai: AiRunner, originalPrompt: string, branchOutputs: string[]): Promise<string> {
  const prompt =
    `You are tallying votes from independent answerers. Identify the consensus answer (or, if none, the most defensible one) and output ONLY that answer.\n\n` +
    `QUESTION:\n${originalPrompt}\n\n` +
    branchOutputs.map((o, i) => `VOTER ${i + 1}:\n${o}`).join("\n\n") +
    `\n\nCONSENSUS:`;
  return callModel(ai, JUDGE_MODEL, prompt);
}

function combinePhysics(branchOutputs: string[], weights: number[]): string {
  const parts = branchOutputs.map((o, i) => `[branch ${i + 1} weight=${weights[i]!.toFixed(2)}]\n${o}`);
  return parts.join("\n\n---\n\n");
}

function injectContext(context: string, prompt: string): string {
  if (!context.trim()) return prompt;
  return `### CONTEXT\n${context}\n### END CONTEXT\n\n${prompt}`;
}

export async function executeCircuit(
  ai: AiRunner,
  circuit: Circuit,
  mode: CircuitMode,
  userPrompt: string,
  capStatesIn: Record<string, string> = {},
  seeds: Record<string, string> = {},
  onUpdate?: (trace: NodeTrace) => void
): Promise<RunResponse> {
  const v = validate(circuit);
  if (!v.ok) return { ok: false, trace: [], error: v.reason };

  const traceMap = new Map<string, NodeTrace>();
  const byId = new Map(circuit.nodes.map((n) => [n.id, n]));
  for (const n of circuit.nodes) {
    traceMap.set(n.id, { nodeId: n.id, modelId: n.kind === "model" ? n.modelId : undefined, kind: n.kind, status: "pending" });
  }

  // Pending capacitor effects scheduled to apply after the next stage:
  // pendingInjects = list of capacitor texts to prepend; pendingAbsorbers = capIds that absorb the next stage's output.
  let pendingInjects: { capId: string; text: string }[] = [];
  let pendingAbsorbers: string[] = [];
  const capStatesOut: Record<string, string> = {};
  const getCapText = (capId: string): string => {
    if (capStatesOut[capId] != null) return capStatesOut[capId]!;
    if (capStatesIn[capId] != null) return capStatesIn[capId]!;
    const node = byId.get(capId);
    if (node?.kind === "capacitor") return seeds[node.seedSlug] ?? "";
    return "";
  };
  const setCapText = (capId: string, text: string) => {
    capStatesOut[capId] = text;
  };

  // Pending inductor: when set, the next single model stage is wrapped to run N times + judge.
  let pendingInductor: { nodeId: string; runs: number } | null = null;

  let currentText = userPrompt;
  let rTotal = 0;
  const PHYSICS_BUDGET = 512;

  const applyPendingInjects = (text: string): string => {
    if (pendingInjects.length === 0) return text;
    const ctx = pendingInjects.map((p) => p.text).filter(Boolean).join("\n\n");
    return injectContext(ctx, text);
  };

  for (let si = 0; si < v.stages.length; si++) {
    const stage = v.stages[si]!;

    if (stage.kind === "single") {
      const node = byId.get(stage.node)!;
      const trace = traceMap.get(stage.node)!;

      if (node.kind === "capacitor") {
        // Schedule effects on the next stage. Don't update currentText.
        const text = getCapText(node.id);
        if (node.mode === "inject" || node.mode === "both") {
          pendingInjects.push({ capId: node.id, text });
        }
        if (node.mode === "absorb" || node.mode === "both") {
          pendingAbsorbers.push(node.id);
        }
        trace.status = "done";
        trace.prompt = `mode=${node.mode} · before:\n${text || "(empty)"}`;
        trace.output = text || "(empty)";
        onUpdate?.(trace);
        continue;
      }

      if (node.kind === "inductor") {
        pendingInductor = { nodeId: node.id, runs: Math.max(1, Math.min(7, node.runs | 0)) };
        trace.status = "done";
        trace.output = `(inductor: ${pendingInductor.runs} runs)`;
        onUpdate?.(trace);
        continue;
      }

      // model node
      const spec = getModel(node.modelId);
      trace.status = "running";
      onUpdate?.(trace);
      const promptIn = applyPendingInjects(
        mode === "refine-vote" && currentText !== userPrompt ? refinePrompt(currentText) : currentText
      );
      pendingInjects = [];
      trace.prompt = promptIn;
      trace.R = spec.R;
      try {
        const maxTokens = mode === "physics" ? PHYSICS_BUDGET : undefined;
        let out: string;
        if (pendingInductor && pendingInductor.runs > 1) {
          const candidates: string[] = [];
          for (let r = 0; r < pendingInductor.runs; r++) {
            candidates.push(await callModel(ai, spec.id, promptIn, maxTokens));
          }
          out = await combineVote(ai, userPrompt, candidates);
          pendingInductor = null;
        } else {
          out = await callModel(ai, spec.id, promptIn, maxTokens);
        }
        trace.output = out;
        trace.status = "done";
        onUpdate?.(trace);
        if (mode === "physics") {
          rTotal += spec.R;
          trace.maxTokens = maxTokens;
        }
        currentText = out;
        // Absorbers: store this stage's output into the pending capacitors
        // and reflect the new state in their trace.
        for (const capId of pendingAbsorbers) {
          setCapText(capId, out);
          const capTrace = traceMap.get(capId);
          if (capTrace) capTrace.output = `after:\n${out}`;
        }
        pendingAbsorbers = [];
      } catch (err) {
        trace.status = "error";
        trace.error = err instanceof Error ? err.message : String(err);
        onUpdate?.(trace);
        return { ok: false, trace: [...traceMap.values()], error: trace.error, capStates: capStatesOut };
      }
    } else {
      // parallel — only model nodes allowed (validator enforced)
      const branchSpecs = stage.nodes.map((id) => {
        const n = byId.get(id);
        if (!n || n.kind !== "model") throw new Error("Non-model in parallel branch");
        return { id, spec: getModel(n.modelId) };
      });
      let weights: number[] = [];
      let maxTokensList: (number | undefined)[] = [];
      if (mode === "physics") {
        const conductances = branchSpecs.map((b) => 1 / b.spec.R);
        const sumG = conductances.reduce((a, b) => a + b, 0);
        weights = conductances.map((g) => g / sumG);
        maxTokensList = weights.map((w) => Math.max(64, Math.round(w * PHYSICS_BUDGET)));
        const rPar = 1 / sumG;
        rTotal += rPar;
      } else {
        weights = branchSpecs.map(() => 1 / branchSpecs.length);
        maxTokensList = branchSpecs.map(() => undefined);
      }

      const branchPrompt = applyPendingInjects(currentText);
      pendingInjects = [];

      const results = await Promise.all(
        branchSpecs.map(async ({ id, spec }, i) => {
          const trace = traceMap.get(id)!;
          trace.status = "running";
          trace.prompt = branchPrompt;
          trace.R = spec.R;
          trace.maxTokens = maxTokensList[i];
          onUpdate?.(trace);
          try {
            const out = await callModel(ai, spec.id, branchPrompt, maxTokensList[i]);
            trace.output = out;
            trace.status = "done";
            onUpdate?.(trace);
            return out;
          } catch (err) {
            trace.status = "error";
            trace.error = err instanceof Error ? err.message : String(err);
            onUpdate?.(trace);
            return "";
          }
        })
      );

      let combined: string;
      if (mode === "chain-ensemble") combined = await combineEnsemble(ai, userPrompt, results);
      else if (mode === "refine-vote") combined = await combineVote(ai, userPrompt, results);
      else combined = combinePhysics(results, weights);

      currentText = combined;
      for (const capId of pendingAbsorbers) {
        setCapText(capId, combined);
        const capTrace = traceMap.get(capId);
        if (capTrace) capTrace.output = `after:\n${combined}`;
      }
      pendingAbsorbers = [];
    }
  }

  return {
    ok: true,
    finalOutput: currentText,
    rTotal: mode === "physics" ? rTotal : undefined,
    trace: [...traceMap.values()],
    capStates: capStatesOut,
  };
}
