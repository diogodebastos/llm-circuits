import { JUDGE_MODEL, getModel } from "./models";
import { validate, type Circuit, type CircuitMode, type CircuitNode } from "./graph";
import type { NodeTrace, RunResponse } from "./runner";

/** Synthetic resistance for non-model endpoints — used in physics-mode parallel weighting. */
function endpointR(node: CircuitNode): number {
  if (node.kind === "model") return getModel(node.modelId).R;
  if (node.kind === "transformer") return getModel(node.modelId).R;
  if (node.kind === "diode") return 1;          // near-zero drop
  if (node.kind === "ground") return Infinity;  // open circuit; gets near-zero conductance
  return 0;
}

async function judgeYesNo(ai: AiRunner, rubric: string, text: string): Promise<boolean> {
  const prompt = `${rubric}\n\nTEXT:\n${text}\n\nReply with exactly YES or NO and nothing else.`;
  const out = await callModel(ai, JUDGE_MODEL, prompt, 8);
  return /^\s*yes/i.test(out);
}

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
    const modelId = n.kind === "model" || n.kind === "transformer" ? n.modelId : undefined;
    traceMap.set(n.id, { nodeId: n.id, modelId, kind: n.kind, status: "pending" });
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
  const PHYSICS_BUDGET = 5120;

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

      if (node.kind === "ground") {
        trace.status = "done";
        trace.output = "(grounded — branch silenced)";
        onUpdate?.(trace);
        currentText = "";
        pendingAbsorbers = [];
        continue;
      }

      if (node.kind === "diode") {
        trace.status = "running";
        const probe = applyPendingInjects(currentText);
        pendingInjects = [];
        trace.prompt = `gate=${node.gate} · onFail=${node.onFail}\n\nINPUT:\n${probe}`;
        onUpdate?.(trace);
        try {
          let pass: boolean;
          if (node.gate === "regex") {
            const pat = node.pattern ?? ".*";
            pass = new RegExp(pat, "i").test(probe);
          } else {
            pass = await judgeYesNo(ai, node.rubric ?? "Is this answer well-formed and on-topic? Reply YES or NO.", probe);
          }
          if (pass) {
            trace.status = "done";
            trace.output = "✓ pass";
            onUpdate?.(trace);
            currentText = probe;
          } else if (node.onFail === "passthrough") {
            trace.status = "done";
            trace.output = "✕ fail · passthrough";
            onUpdate?.(trace);
            currentText = probe;
          } else {
            // block: silence the branch (currentText becomes empty; downstream join filters)
            trace.status = "done";
            trace.output = "✕ fail · blocked";
            onUpdate?.(trace);
            currentText = "";
            pendingAbsorbers = [];
          }
        } catch (err) {
          trace.status = "error";
          trace.error = err instanceof Error ? err.message : String(err);
          onUpdate?.(trace);
          return { ok: false, trace: [...traceMap.values()], error: trace.error, capStates: capStatesOut };
        }
        continue;
      }

      if (node.kind === "transformer") {
        const spec = getModel(node.modelId);
        trace.status = "running";
        onUpdate?.(trace);
        const promptIn = applyPendingInjects(`${node.instruction}\n\nINPUT:\n${currentText}`);
        pendingInjects = [];
        trace.prompt = promptIn;
        trace.R = spec.R;
        try {
          const maxTokens = node.maxTokens ?? (mode === "physics" ? PHYSICS_BUDGET : undefined);
          const out = await callModel(ai, spec.id, promptIn, maxTokens);
          trace.output = out;
          trace.status = "done";
          if (maxTokens != null) trace.maxTokens = maxTokens;
          onUpdate?.(trace);
          if (mode === "physics") rTotal += spec.R;
          currentText = out;
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
        const maxTokens = node.maxTokens ?? (mode === "physics" ? PHYSICS_BUDGET : undefined);
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
        }
        if (maxTokens != null) trace.maxTokens = maxTokens;
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
      // parallel — each branch is an endpoint (model/diode/transformer/ground),
      // optionally preceded by a capacitor whose inject/absorb applies only
      // within that branch.
      const branchSpecs = stage.branches.map((br) => {
        const n = byId.get(br.model);
        if (!n) throw new Error("Branch endpoint missing");
        const capNode = br.cap ? byId.get(br.cap) : undefined;
        if (br.cap && (!capNode || capNode.kind !== "capacitor")) {
          throw new Error("Branch capacitor missing or wrong kind");
        }
        const R = endpointR(n);
        return {
          id: br.model,
          capId: br.cap,
          capNode: capNode?.kind === "capacitor" ? capNode : undefined,
          R,
          node: n,
        };
      });
      let weights: number[] = [];
      let maxTokensList: (number | undefined)[] = [];
      if (mode === "physics") {
        const conductances = branchSpecs.map((b) => (Number.isFinite(b.R) && b.R > 0 ? 1 / b.R : 0));
        const sumG = conductances.reduce((a, b) => a + b, 0) || 1;
        weights = conductances.map((g) => g / sumG);
        maxTokensList = branchSpecs.map((b, i) => {
          if (b.node.kind === "ground" || b.node.kind === "diode") return undefined;
          const cap = (b.node as { maxTokens?: number }).maxTokens;
          return cap ?? Math.max(64, Math.round(weights[i]! * PHYSICS_BUDGET));
        });
        const rPar = 1 / sumG;
        rTotal += rPar;
      } else {
        weights = branchSpecs.map(() => 1 / branchSpecs.length);
        maxTokensList = branchSpecs.map((b) => (b.node as { maxTokens?: number }).maxTokens);
      }

      const branchPromptBase = applyPendingInjects(currentText);
      pendingInjects = [];

      const results = await Promise.all(
        branchSpecs.map(async ({ id, capId, capNode, R, node: bnode }, i) => {
          let branchPrompt = branchPromptBase;
          if (capId && capNode) {
            const capText = getCapText(capId);
            const capTrace = traceMap.get(capId)!;
            capTrace.prompt = `mode=${capNode.mode} · before:\n${capText || "(empty)"}`;
            capTrace.output = capText || "(empty)";
            capTrace.status = "done";
            onUpdate?.(capTrace);
            if (capNode.mode === "inject" || capNode.mode === "both") {
              branchPrompt = injectContext(capText, branchPrompt);
            }
          }
          const trace = traceMap.get(id)!;

          if (bnode.kind === "ground") {
            trace.status = "done";
            trace.output = "(grounded — silenced)";
            onUpdate?.(trace);
            return "";
          }

          if (bnode.kind === "diode") {
            trace.status = "running";
            trace.prompt = `gate=${bnode.gate} · onFail=${bnode.onFail}\n\nINPUT:\n${branchPrompt}`;
            onUpdate?.(trace);
            try {
              let pass: boolean;
              if (bnode.gate === "regex") {
                pass = new RegExp(bnode.pattern ?? ".*", "i").test(branchPrompt);
              } else {
                pass = await judgeYesNo(ai, bnode.rubric ?? "Is this on-topic? YES or NO.", branchPrompt);
              }
              if (pass) {
                trace.status = "done";
                trace.output = "✓ pass";
                onUpdate?.(trace);
                return branchPrompt;
              }
              trace.status = "done";
              trace.output = bnode.onFail === "passthrough" ? "✕ fail · passthrough" : "✕ fail · blocked";
              onUpdate?.(trace);
              return bnode.onFail === "passthrough" ? branchPrompt : "";
            } catch (err) {
              trace.status = "error";
              trace.error = err instanceof Error ? err.message : String(err);
              onUpdate?.(trace);
              return "";
            }
          }

          // model or transformer
          const modelId = (bnode as { modelId: string }).modelId;
          const spec = getModel(modelId);
          const promptForCall =
            bnode.kind === "transformer"
              ? `${(bnode as { instruction: string }).instruction}\n\nINPUT:\n${branchPrompt}`
              : branchPrompt;
          trace.status = "running";
          trace.prompt = promptForCall;
          trace.R = spec.R;
          trace.maxTokens = maxTokensList[i];
          onUpdate?.(trace);
          try {
            const out = await callModel(ai, spec.id, promptForCall, maxTokensList[i]);
            trace.output = out;
            trace.status = "done";
            onUpdate?.(trace);
            if (capId && capNode && (capNode.mode === "absorb" || capNode.mode === "both")) {
              setCapText(capId, out);
              const capTrace = traceMap.get(capId);
              if (capTrace) capTrace.output = `after:\n${out}`;
            }
            return out;
          } catch (err) {
            trace.status = "error";
            trace.error = err instanceof Error ? err.message : String(err);
            onUpdate?.(trace);
            return "";
          }
        })
      );

      // Filter silenced (grounded / blocked) branches before combining.
      const survivors = results.map((r, i) => ({ r, w: weights[i]! })).filter((s) => s.r.length > 0);
      const survivorOutputs = survivors.map((s) => s.r);
      const survivorWeights = survivors.map((s) => s.w);

      let combined: string;
      if (survivorOutputs.length === 0) {
        combined = "";
      } else if (mode === "chain-ensemble") combined = await combineEnsemble(ai, userPrompt, survivorOutputs);
      else if (mode === "refine-vote") combined = await combineVote(ai, userPrompt, survivorOutputs);
      else combined = combinePhysics(survivorOutputs, survivorWeights);

      currentText = combined;
      for (const capId of pendingAbsorbers) {
        setCapText(capId, combined);
        const capTrace = traceMap.get(capId);
        if (capTrace) capTrace.output = `after:\n${combined}`;
      }
      pendingAbsorbers = [];
    }
  }

  // Eval: if any capacitor has role=golden, score the final output against it.
  let evalResult: RunResponse["evalResult"];
  const goldenCap = circuit.nodes.find((n) => n.kind === "capacitor" && n.role === "golden");
  if (goldenCap && currentText) {
    try {
      const golden = getCapText(goldenCap.id);
      if (golden.trim()) {
        const judgePrompt =
          `You are an evaluator. Score the CANDIDATE answer 0-10 for how well it matches the GOLDEN answer ` +
          `(content fidelity, completeness, correctness). Reply with one line of JSON: {"score": N, "why": "..."}\n\n` +
          `GOLDEN:\n${golden}\n\nCANDIDATE:\n${currentText}\n\nJSON:`;
        const raw = await callModel(ai, JUDGE_MODEL, judgePrompt, 200);
        const m = raw.match(/\{[^}]*\}/);
        if (m) {
          const parsed = JSON.parse(m[0]) as { score?: number; why?: string };
          const score = Math.max(0, Math.min(10, Number(parsed.score) || 0));
          evalResult = { score, rationale: String(parsed.why ?? ""), goldenCapId: goldenCap.id };
        }
      }
    } catch {
      // soft-fail: scoring is best-effort
    }
  }

  return {
    ok: true,
    finalOutput: currentText,
    rTotal: mode === "physics" ? rTotal : undefined,
    trace: [...traceMap.values()],
    capStates: capStatesOut,
    evalResult,
  };
}
