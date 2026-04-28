import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Edge,
  type Node,
  type Connection,
} from "@xyflow/react";
import ModelNode from "./ModelNode";
import CapacitorNode from "./CapacitorNode";
import InductorNode from "./InductorNode";
import { PRESETS } from "@/lib/presets";
import { MODELS } from "@/lib/models";
import type { CapacitorMode, Circuit, CircuitMode, CircuitNode } from "@/lib/graph";
import type { NodeTrace, RunResponse } from "@/lib/runner";
import { runCircuit } from "@/lib/runner";
import {
  encodeCircuit,
  loadAutosave,
  loadAllCapStates,
  loadCapState,
  readHashCircuit,
  saveAutosave,
  saveCapState,
  clearAutosave,
  clearCapState,
  clearHash,
  writeHashCircuit,
} from "@/lib/persist";

const nodeTypes = { modelNode: ModelNode, capacitorNode: CapacitorNode, inductorNode: InductorNode };

function CodeBlock({ lang, content }: { lang: string; content: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="rounded border border-stone-700 bg-stone-900 dark:border-stone-600 dark:bg-stone-950">
      <div className="flex items-center justify-between border-b border-stone-700 px-3 py-1 dark:border-stone-600">
        <span className="text-[10px] text-stone-400">{lang || "code"}</span>
        <button
          onClick={copy}
          className="text-[10px] text-stone-400 transition-colors hover:text-[#f6821f]"
        >
          {copied ? "✓ copied" : "copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[11px] leading-relaxed text-stone-100">
        <code>{content}</code>
      </pre>
    </div>
  );
}

function FormattedOutput({ text }: { text: string }) {
  const parts: Array<{ type: "text" | "code"; content: string; lang?: string }> = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", content: text.slice(last, m.index) });
    parts.push({ type: "code", lang: m[1] || "", content: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", content: text.slice(last) });

  if (parts.length === 0) return <span className="whitespace-pre-wrap">{text}</span>;
  return (
    <div className="space-y-2">
      {parts.map((p, i) =>
        p.type === "code" ? (
          <CodeBlock key={i} lang={p.lang!} content={p.content} />
        ) : p.content.trim() ? (
          <div key={i} className="whitespace-pre-wrap">{p.content}</div>
        ) : null
      )}
    </div>
  );
}

const MODES: Array<{ id: CircuitMode; label: string; blurb: string }> = [
  { id: "refine-vote", label: "Refine / Vote", blurb: "Series refines prior answer. Parallel votes for consensus." },
  { id: "chain-ensemble", label: "Chain / Ensemble", blurb: "Series chains output. Parallel synthesizes via judge." },
  { id: "physics", label: "Physics-faithful", blurb: "Resistance ∝ params. Parallel splits token budget by 1/R." },
];

interface Seed { slug: string; title: string; body: string; }

function nodeKindToType(kind: CircuitNode["kind"]): string {
  return kind === "capacitor" ? "capacitorNode" : kind === "inductor" ? "inductorNode" : "modelNode";
}

function circuitToFlow(c: Circuit): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: c.nodes.map((n) => ({
      id: n.id,
      type: nodeKindToType(n.kind),
      position: n.position ?? { x: 0, y: 0 },
      data:
        n.kind === "model"
          ? { kind: "model", modelId: n.modelId }
          : n.kind === "capacitor"
            ? { kind: "capacitor", seedSlug: n.seedSlug, mode: n.mode }
            : { kind: "inductor", runs: n.runs },
    })),
    edges: c.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: true,
      style: { stroke: "#f6821f", strokeWidth: 2 },
    })),
  };
}

function flowToCircuit(nodes: Node[], edges: Edge[]): Circuit {
  return {
    nodes: nodes.map((n) => {
      const d = n.data as any;
      const base = { id: n.id, position: n.position };
      if (d.kind === "capacitor") return { kind: "capacitor", ...base, seedSlug: d.seedSlug ?? "blank", mode: (d.mode as CapacitorMode) ?? "both" };
      if (d.kind === "inductor") return { kind: "inductor", ...base, runs: Number(d.runs ?? 3) };
      return { kind: "model", ...base, modelId: d.modelId };
    }),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  };
}

function useDarkMode() {
  const [dark, setDark] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains("dark"))
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

function Inner() {
  const initialCircuit = useMemo<Circuit>(() => {
    const fromHash = readHashCircuit();
    if (fromHash && fromHash.nodes.length > 0) return fromHash;
    const fromLS = loadAutosave();
    if (fromLS && fromLS.nodes.length > 0) return fromLS;
    return PRESETS.series2!.circuit;
  }, []);

  const initial = useMemo(() => circuitToFlow(initialCircuit), [initialCircuit]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [mode, setMode] = useState<CircuitMode>("refine-vote");
  const [prompt, setPrompt] = useState("Explain why the sky is blue in two sentences.");
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<RunResponse | null>(null);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [shareMsg, setShareMsg] = useState<string>("");
  const isDark = useDarkMode();

  // Fetch seed library once.
  useEffect(() => {
    fetch("/api/capacitors")
      .then((r) => r.json())
      .then((s: Seed[]) => setSeeds(s))
      .catch(() => setSeeds([]));
  }, []);

  // Stable callbacks — defined before injection effect.
  const onChangeModel = useCallback(
    (nodeId: string, newModel: string) => {
      setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...(n.data as object), modelId: newModel } } : n)));
    },
    [setNodes]
  );
  const onChangeCapSeed = useCallback(
    (nodeId: string, slug: string) => {
      setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...(n.data as object), seedSlug: slug } } : n)));
    },
    [setNodes]
  );
  const onChangeCapMode = useCallback(
    (nodeId: string, m: CapacitorMode) => {
      setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...(n.data as object), mode: m } } : n)));
    },
    [setNodes]
  );
  const onClearCap = useCallback(
    (nodeId: string) => {
      clearCapState(nodeId);
      setNodes((ns) =>
        ns.map((n) =>
          n.id === nodeId ? { ...n, data: { ...(n.data as object), storedChars: 0, storedText: "" } } : n
        )
      );
    },
    [setNodes]
  );
  const onSaveCapText = useCallback(
    (nodeId: string, text: string) => {
      saveCapState(nodeId, text);
      setNodes((ns) =>
        ns.map((n) =>
          n.id === nodeId ? { ...n, data: { ...(n.data as object), storedText: text, storedChars: text.length } } : n
        )
      );
    },
    [setNodes]
  );
  const onChangeInductorRuns = useCallback(
    (nodeId: string, n: number) => {
      setNodes((ns) => ns.map((node) => (node.id === nodeId ? { ...node, data: { ...(node.data as object), runs: n } } : node)));
    },
    [setNodes]
  );

  const decorate = useCallback(
    (n: Node): Node => {
      const d = n.data as any;
      if (d.kind === "capacitor") {
        const stored = loadCapState(n.id);
        const seedBody = seeds.find((s) => s.slug === d.seedSlug)?.body ?? "";
        const text = stored ?? seedBody;
        return {
          ...n,
          data: {
            ...d,
            seeds,
            storedChars: text.length,
            storedText: text,
            onChangeSeed: (slug: string) => onChangeCapSeed(n.id, slug),
            onChangeMode: (m: CapacitorMode) => onChangeCapMode(n.id, m),
            onClear: () => onClearCap(n.id),
            onSaveText: (t: string) => onSaveCapText(n.id, t),
          },
        };
      }
      if (d.kind === "inductor") {
        return { ...n, data: { ...d, onChangeRuns: (v: number) => onChangeInductorRuns(n.id, v) } };
      }
      return { ...n, data: { ...d, onChangeModel: (mid: string) => onChangeModel(n.id, mid) } };
    },
    [seeds, onChangeModel, onChangeCapSeed, onChangeCapMode, onClearCap, onSaveCapText, onChangeInductorRuns]
  );

  // Re-inject callbacks/seeds whenever the decorator identity changes.
  useEffect(() => {
    setNodes((ns) => ns.map(decorate));
  }, [decorate, setNodes]);

  // Splice trace into nodes after a run.
  useEffect(() => {
    if (!response) return;
    const traceById = new Map(response.trace.map((t) => [t.nodeId, t]));
    setNodes((ns) =>
      ns.map((n) => ({
        ...n,
        data: { ...(n.data as object), trace: traceById.get(n.id) },
      }))
    );
    if (response.capStates) {
      for (const [id, text] of Object.entries(response.capStates)) {
        saveCapState(id, text);
        setNodes((ns) =>
          ns.map((n) =>
            n.id === id ? { ...n, data: { ...(n.data as object), storedText: text, storedChars: text.length } } : n
          )
        );
      }
    }
  }, [response, setNodes]);

  // Persist circuit (debounced) on any node/edge change.
  const persistTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      const c = flowToCircuit(nodes, edges);
      saveAutosave(c);
      writeHashCircuit(c);
    }, 400);
  }, [nodes, edges]);

  const onConnect = useCallback(
    (conn: Connection) => {
      setEdges((es) => addEdge({ ...conn, animated: true, style: { stroke: "#f6821f", strokeWidth: 2 } }, es));
    },
    [setEdges]
  );

  const loadPreset = (key: keyof typeof PRESETS) => {
    const f = circuitToFlow(PRESETS[key]!.circuit);
    setNodes(f.nodes.map(decorate));
    setEdges(f.edges);
  };

  const newCanvas = () => {
    setNodes([]);
    setEdges([]);
  };

  const resetEverything = () => {
    clearAutosave();
    clearHash();
    newCanvas();
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareMsg("link copied ✓");
      setTimeout(() => setShareMsg(""), 1500);
    } catch {
      setShareMsg("copy failed");
    }
  };

  const addModelNode = (modelId: string) => {
    const id = `n${Date.now().toString(36)}`;
    setNodes((ns) => {
      const maxX = ns.reduce((m, n) => Math.max(m, n.position?.x ?? 0), -Infinity);
      const x = ns.length === 0 ? 80 : maxX + 240;
      const y = 160 + (ns.length % 2 === 0 ? 0 : 40);
      return [
        ...ns,
        {
          id,
          type: "modelNode",
          position: { x, y },
          data: { kind: "model", modelId, onChangeModel: (mid: string) => onChangeModel(id, mid) },
        },
      ];
    });
  };

  const addCapacitor = (seedSlug: string) => {
    const id = `c${Date.now().toString(36)}`;
    setNodes((ns) => {
      const maxX = ns.reduce((m, n) => Math.max(m, n.position?.x ?? 0), -Infinity);
      const x = ns.length === 0 ? 80 : maxX + 240;
      const y = 160 + (ns.length % 2 === 0 ? 0 : 40);
      return [
        ...ns,
        {
          id,
          type: "capacitorNode",
          position: { x, y },
          data: {
            kind: "capacitor",
            seedSlug,
            mode: "both" as CapacitorMode,
            seeds,
            storedChars: (seeds.find((s) => s.slug === seedSlug)?.body ?? "").length,
            storedText: seeds.find((s) => s.slug === seedSlug)?.body ?? "",
            onChangeSeed: (slug: string) => onChangeCapSeed(id, slug),
            onChangeMode: (m: CapacitorMode) => onChangeCapMode(id, m),
            onClear: () => onClearCap(id),
            onSaveText: (t: string) => onSaveCapText(id, t),
          },
        },
      ];
    });
  };

  const addInductor = () => {
    const id = `l${Date.now().toString(36)}`;
    setNodes((ns) => {
      const maxX = ns.reduce((m, n) => Math.max(m, n.position?.x ?? 0), -Infinity);
      const x = ns.length === 0 ? 80 : maxX + 240;
      const y = 160 + (ns.length % 2 === 0 ? 0 : 40);
      return [
        ...ns,
        {
          id,
          type: "inductorNode",
          position: { x, y },
          data: { kind: "inductor", runs: 3, onChangeRuns: (v: number) => onChangeInductorRuns(id, v) },
        },
      ];
    });
  };

  const onRun = async () => {
    setRunning(true);
    setResponse(null);
    const circuit = flowToCircuit(nodes, edges);
    const capIds = circuit.nodes.filter((n) => n.kind === "capacitor").map((n) => n.id);
    const capStates = loadAllCapStates(capIds);
    const seedMap: Record<string, string> = {};
    for (const s of seeds) seedMap[s.slug] = s.body;
    const res = await runCircuit({ circuit, mode, prompt, capStates, seeds: seedMap });
    setResponse(res);
    setRunning(false);
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)_360px]">
      <aside className="space-y-4 rounded-md border border-stone-200 bg-white p-4 text-sm shadow-sm dark:border-stone-800 dark:bg-stone-950">
        <div>
          <h3 className="mb-2 text-xs uppercase tracking-wider text-stone-400 dark:text-stone-500">Canvas</h3>
          <button onClick={newCanvas} className="w-full rounded bg-stone-100 px-2 py-1 text-left text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700">
            + New canvas
          </button>
          <button onClick={copyShareLink} className="mt-1 w-full rounded bg-stone-100 px-2 py-1 text-left text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700">
            🔗 Copy share link {shareMsg && <span className="text-emerald-600 dark:text-emerald-400">— {shareMsg}</span>}
          </button>
          <button onClick={resetEverything} className="mt-1 w-full rounded bg-stone-100 px-2 py-1 text-left text-rose-500 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700">
            ⟲ Reset (wipe save)
          </button>
        </div>
        <div>
          <h3 className="mb-2 text-xs uppercase tracking-wider text-stone-400 dark:text-stone-500">Presets</h3>
          <div className="flex flex-col gap-1">
            {Object.entries(PRESETS).map(([k, p]) => (
              <button key={k} onClick={() => loadPreset(k as keyof typeof PRESETS)} className="rounded bg-stone-100 px-2 py-1 text-left text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700">
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-xs uppercase tracking-wider text-stone-400 dark:text-stone-500">Add resistor</h3>
          <div className="flex flex-col gap-1">
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => addModelNode(m.id)}
                className="rounded bg-stone-100 px-2 py-1 text-left text-xs text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
                title={m.description}
              >
                + {m.label} <span className="text-stone-400 dark:text-stone-500">{m.R}Ω</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-xs uppercase tracking-wider text-stone-400 dark:text-stone-500">Add memory</h3>
          <div className="flex flex-col gap-1">
            {seeds.map((s) => (
              <button
                key={s.slug}
                onClick={() => addCapacitor(s.slug)}
                className="rounded bg-stone-100 px-2 py-1 text-left text-xs text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
              >
                + ⊓ {s.title}
              </button>
            ))}
            <button onClick={addInductor} className="rounded bg-stone-100 px-2 py-1 text-left text-xs text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700">
              + ∿ Inductor
            </button>
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-xs uppercase tracking-wider text-stone-400 dark:text-stone-500">Mode</h3>
          <div className="flex flex-col gap-1">
            {MODES.map((m) => (
              <label
                key={m.id}
                className={`cursor-pointer rounded border px-2 py-1 text-xs ${
                  mode === m.id
                    ? "border-[#f6821f] bg-orange-50 text-stone-800 dark:bg-stone-800 dark:text-stone-100"
                    : "border-stone-200 text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                }`}
              >
                <input type="radio" name="mode" className="mr-1" checked={mode === m.id} onChange={() => setMode(m.id)} />
                <span className="font-bold">{m.label}</span>
                <div className="text-[10px] text-stone-400 dark:text-stone-500">{m.blurb}</div>
              </label>
            ))}
          </div>
        </div>
      </aside>

      <div className="h-[640px] overflow-hidden rounded-md border border-stone-200 bg-[#faf9f6] shadow-sm dark:border-stone-800 dark:bg-stone-950">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          minZoom={0.5}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} color={isDark ? "#292524" : "#e8e0d8"} />
          <Controls />
          <MiniMap pannable zoomable className="!bg-white dark:!bg-stone-900" />
        </ReactFlow>
      </div>

      <aside className="space-y-3 rounded-md border border-stone-200 bg-white p-4 text-sm shadow-sm dark:border-stone-800 dark:bg-stone-950">
        <h3 className="text-xs uppercase tracking-wider text-stone-400 dark:text-stone-500">Prompt (Voltage)</h3>
        <textarea
          className="h-32 w-full rounded border border-stone-200 bg-stone-50 p-2 text-xs text-stone-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button
          onClick={onRun}
          disabled={running}
          className="w-full rounded bg-[#f6821f] px-3 py-2 font-bold text-white hover:bg-[#e5741a] disabled:opacity-50"
        >
          {running ? "Running…" : "⚡ Apply Current"}
        </button>
        {response?.error && <div className="rounded bg-rose-50 p-2 text-xs text-rose-600 dark:bg-rose-950 dark:text-rose-300">{response.error}</div>}
        {response?.rTotal != null && (
          <div className="rounded bg-stone-100 p-2 text-xs text-stone-700 dark:bg-stone-800 dark:text-stone-300">
            R<sub>total</sub> = {response.rTotal.toFixed(2)}Ω
          </div>
        )}
        {response?.finalOutput && (
          <div>
            <h4 className="mb-1 text-xs uppercase tracking-wider text-stone-400 dark:text-stone-500">Final output</h4>
            <div className="max-h-72 overflow-y-auto rounded border border-stone-200 bg-stone-50 p-2 text-xs text-stone-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100">
              <FormattedOutput text={response.finalOutput} />
            </div>
          </div>
        )}
        {response?.trace && response.trace.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs uppercase tracking-wider text-stone-400 dark:text-stone-500">Per-node trace</h4>
            <div className="space-y-1">
              {response.trace.map((t) => (
                <details key={t.nodeId} className="rounded border border-stone-200 bg-stone-50 p-2 text-[11px] dark:border-stone-700 dark:bg-stone-900">
                  <summary className="cursor-pointer">
                    <span className="font-bold text-stone-800 dark:text-stone-100">{t.modelId ? t.modelId.split("/").pop() : t.kind}</span>
                    <span className="ml-2 text-stone-400 dark:text-stone-500">{t.status}</span>
                    {t.maxTokens != null && <span className="ml-2 text-stone-400 dark:text-stone-500">max={t.maxTokens}</span>}
                  </summary>
                  {t.output && <div className="mt-1 whitespace-pre-wrap text-stone-700 dark:text-stone-300">{t.output}</div>}
                  {t.error && <div className="mt-1 text-rose-500 dark:text-rose-400">{t.error}</div>}
                </details>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

export default function CircuitCanvas() {
  return (
    <ReactFlowProvider>
      <Inner />
    </ReactFlowProvider>
  );
}
