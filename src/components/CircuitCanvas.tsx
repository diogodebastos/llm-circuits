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
import DiodeNode from "./DiodeNode";
import TransformerNode from "./TransformerNode";
import GroundNode from "./GroundNode";
import CompareTable, { type CompareRow } from "./CompareTable";
import { exportAsMcpTool, downloadMcpToolSpec } from "@/lib/mcp";
import { PRESETS } from "@/lib/presets";
import { MODELS } from "@/lib/models";
import type { CapacitorMode, Circuit, CircuitMode, CircuitNode, DiodeGate, DiodeOnFail } from "@/lib/graph";
import type { NodeTrace, RunResponse } from "@/lib/runner";
import { runCircuit } from "@/lib/runner";
import type { CfCreds } from "@/lib/runner";
import { useIsMobile } from "@/lib/useIsMobile";
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

const nodeTypes = {
  modelNode: ModelNode,
  capacitorNode: CapacitorNode,
  inductorNode: InductorNode,
  diodeNode: DiodeNode,
  transformerNode: TransformerNode,
  groundNode: GroundNode,
};

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
  { id: "physics", label: "Physics-faithful", blurb: "Resistance ∝ params. Parallel splits token budget by 1/R." },
  { id: "refine-vote", label: "Refine / Vote", blurb: "Series refines prior answer. Parallel votes for consensus." },
  { id: "chain-ensemble", label: "Chain / Ensemble", blurb: "Series chains output. Parallel synthesizes via judge." },
];

interface Seed { slug: string; title: string; body: string; }

function nodeKindToType(kind: CircuitNode["kind"]): string {
  switch (kind) {
    case "capacitor": return "capacitorNode";
    case "inductor": return "inductorNode";
    case "diode": return "diodeNode";
    case "transformer": return "transformerNode";
    case "ground": return "groundNode";
    default: return "modelNode";
  }
}

function circuitToFlow(c: Circuit): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: c.nodes.map((n) => {
      let data: Record<string, unknown>;
      switch (n.kind) {
        case "model": data = { kind: "model", modelId: n.modelId }; break;
        case "capacitor": data = { kind: "capacitor", seedSlug: n.seedSlug, mode: n.mode, role: n.role }; break;
        case "inductor": data = { kind: "inductor", runs: n.runs }; break;
        case "diode": data = { kind: "diode", gate: n.gate, pattern: n.pattern, rubric: n.rubric, onFail: n.onFail }; break;
        case "transformer": data = { kind: "transformer", instruction: n.instruction, modelId: n.modelId }; break;
        case "ground": data = { kind: "ground" }; break;
      }
      return {
        id: n.id,
        type: nodeKindToType(n.kind),
        position: n.position ?? { x: 0, y: 0 },
        data,
      };
    }),
    edges: c.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: true,
      style: { stroke: "#f6821f", strokeWidth: 2 },
    })),
  };
}

function rotateForMobile(c: Circuit): Circuit {
  return {
    ...c,
    nodes: c.nodes.map((n) => ({
      ...n,
      position: n.position ? { x: n.position.y, y: n.position.x } : { x: 0, y: 0 },
    })),
  };
}

function flowToCircuit(nodes: Node[], edges: Edge[]): Circuit {
  return {
    nodes: nodes.map((n) => {
      const d = n.data as any;
      const base = { id: n.id, position: n.position };
      if (d.kind === "capacitor") return { kind: "capacitor", ...base, seedSlug: d.seedSlug ?? "blank", mode: (d.mode as CapacitorMode) ?? "both", ...(d.role === "golden" ? { role: "golden" as const } : {}) };
      if (d.kind === "inductor") return { kind: "inductor", ...base, runs: Number(d.runs ?? 3) };
      if (d.kind === "diode") return { kind: "diode", ...base, gate: (d.gate as DiodeGate) ?? "judge", pattern: d.pattern, rubric: d.rubric, onFail: (d.onFail as DiodeOnFail) ?? "block" };
      if (d.kind === "transformer") return { kind: "transformer", ...base, instruction: String(d.instruction ?? ""), modelId: String(d.modelId ?? "@cf/meta/llama-3.1-8b-instruct") };
      if (d.kind === "ground") return { kind: "ground", ...base };
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

function SectionHeader({ label }: { label: string }) {
  return (
    <h3 className="mb-2 flex items-center gap-1.5 text-[9px] font-normal uppercase tracking-[0.16em] text-stone-400 dark:text-stone-600">
      <span className="inline-block h-px w-3 bg-stone-300 dark:bg-stone-700" />
      {label}
    </h3>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin-cw h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
    </svg>
  );
}

function Inner() {
  const isMobile = useIsMobile();
  const initialCircuit = useMemo<Circuit>(() => {
    const fromHash = readHashCircuit();
    if (fromHash && fromHash.nodes.length > 0) return fromHash;
    const fromLS = loadAutosave();
    if (fromLS && fromLS.nodes.length > 0) return fromLS;
    return isMobile ? rotateForMobile(PRESETS.series2!.circuit) : PRESETS.series2!.circuit;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initial = useMemo(() => circuitToFlow(initialCircuit), [initialCircuit]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [mode, setMode] = useState<CircuitMode>("physics");
  const [prompt, setPrompt] = useState("Explain why the sky is blue in two sentences.");
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<RunResponse | null>(null);
  const [compareRows, setCompareRows] = useState<CompareRow[] | null>(null);
  const [comparing, setComparing] = useState(false);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [shareMsg, setShareMsg] = useState<string>("");
  const isDark = useDarkMode();

  const [cfCreds, setCfCreds] = useState<CfCreds | null>(() => {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem("llm-circuits:cfcreds");
    if (!raw) return null;
    try { return JSON.parse(raw) as CfCreds; } catch { return null; }
  });

  useEffect(() => {
    const handler = () => {
      const raw = localStorage.getItem("llm-circuits:cfcreds");
      if (!raw) { setCfCreds(null); return; }
      try { setCfCreds(JSON.parse(raw) as CfCreds); } catch { setCfCreds(null); }
    };
    window.addEventListener("cfcreds-updated", handler);
    return () => window.removeEventListener("cfcreds-updated", handler);
  }, []);

  useEffect(() => {
    fetch("/api/capacitors")
      .then((r) => r.json())
      .then((s) => setSeeds(s as Seed[]))
      .catch(() => setSeeds([]));
  }, []);

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
  const onChangeCapRole = useCallback(
    (nodeId: string, role: "memory" | "golden") => {
      setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...(n.data as object), role } } : n)));
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
  const onChangeDiodeField = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      setNodes((ns) => ns.map((node) => (node.id === nodeId ? { ...node, data: { ...(node.data as object), ...patch } } : node)));
    },
    [setNodes]
  );
  const onChangeTransformerField = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      setNodes((ns) => ns.map((node) => (node.id === nodeId ? { ...node, data: { ...(node.data as object), ...patch } } : node)));
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
            onChangeRole: (r: "memory" | "golden") => onChangeCapRole(n.id, r),
            onClear: () => onClearCap(n.id),
            onSaveText: (t: string) => onSaveCapText(n.id, t),
          },
        };
      }
      if (d.kind === "inductor") {
        return { ...n, data: { ...d, onChangeRuns: (v: number) => onChangeInductorRuns(n.id, v) } };
      }
      if (d.kind === "diode") {
        return {
          ...n,
          data: {
            ...d,
            onChangeGate: (g: DiodeGate) => onChangeDiodeField(n.id, { gate: g }),
            onChangePattern: (p: string) => onChangeDiodeField(n.id, { pattern: p }),
            onChangeRubric: (r: string) => onChangeDiodeField(n.id, { rubric: r }),
            onChangeOnFail: (m: DiodeOnFail) => onChangeDiodeField(n.id, { onFail: m }),
          },
        };
      }
      if (d.kind === "transformer") {
        return {
          ...n,
          data: {
            ...d,
            onChangeInstruction: (s: string) => onChangeTransformerField(n.id, { instruction: s }),
            onChangeModel: (mid: string) => onChangeTransformerField(n.id, { modelId: mid }),
          },
        };
      }
      if (d.kind === "ground") {
        return { ...n, data: { ...d } };
      }
      return { ...n, data: { ...d, onChangeModel: (mid: string) => onChangeModel(n.id, mid) } };
    },
    [seeds, onChangeModel, onChangeCapSeed, onChangeCapMode, onChangeCapRole, onClearCap, onSaveCapText, onChangeInductorRuns, onChangeDiodeField, onChangeTransformerField]
  );

  useEffect(() => {
    setNodes((ns) => ns.map(decorate));
  }, [decorate, setNodes]);

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
    const preset = PRESETS[key]!;
    const c = isMobile ? rotateForMobile(preset.circuit) : preset.circuit;
    const f = circuitToFlow(c);
    setNodes(f.nodes.map(decorate));
    setEdges(f.edges);
    if (preset.prompt !== undefined) setPrompt(preset.prompt);
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
      setShareMsg("copied ✓");
      setTimeout(() => setShareMsg(""), 1500);
    } catch {
      setShareMsg("failed");
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
            onChangeRole: (r: "memory" | "golden") => onChangeCapRole(id, r),
            onClear: () => onClearCap(id),
            onSaveText: (t: string) => onSaveCapText(id, t),
          },
        },
      ];
    });
  };

  const addDiode = () => {
    const id = `d${Date.now().toString(36)}`;
    setNodes((ns) => {
      const maxX = ns.reduce((m, n) => Math.max(m, n.position?.x ?? 0), -Infinity);
      const x = ns.length === 0 ? 80 : maxX + 240;
      const y = 160 + (ns.length % 2 === 0 ? 0 : 40);
      return [
        ...ns,
        {
          id,
          type: "diodeNode",
          position: { x, y },
          data: {
            kind: "diode",
            gate: "judge" as DiodeGate,
            rubric: "Is this answer factually well-grounded? Reply YES or NO.",
            onFail: "block" as DiodeOnFail,
            onChangeGate: (g: DiodeGate) => onChangeDiodeField(id, { gate: g }),
            onChangePattern: (p: string) => onChangeDiodeField(id, { pattern: p }),
            onChangeRubric: (r: string) => onChangeDiodeField(id, { rubric: r }),
            onChangeOnFail: (m: DiodeOnFail) => onChangeDiodeField(id, { onFail: m }),
          },
        },
      ];
    });
  };

  const addTransformer = () => {
    const id = `t${Date.now().toString(36)}`;
    setNodes((ns) => {
      const maxX = ns.reduce((m, n) => Math.max(m, n.position?.x ?? 0), -Infinity);
      const x = ns.length === 0 ? 80 : maxX + 240;
      const y = 160 + (ns.length % 2 === 0 ? 0 : 40);
      return [
        ...ns,
        {
          id,
          type: "transformerNode",
          position: { x, y },
          data: {
            kind: "transformer",
            instruction: "Reformat the following text as a clear bulleted list.",
            modelId: "@cf/meta/llama-3.1-8b-instruct",
            onChangeInstruction: (s: string) => onChangeTransformerField(id, { instruction: s }),
            onChangeModel: (mid: string) => onChangeTransformerField(id, { modelId: mid }),
          },
        },
      ];
    });
  };

  const addGround = () => {
    const id = `g${Date.now().toString(36)}`;
    setNodes((ns) => {
      const maxX = ns.reduce((m, n) => Math.max(m, n.position?.x ?? 0), -Infinity);
      const x = ns.length === 0 ? 80 : maxX + 240;
      const y = 160 + (ns.length % 2 === 0 ? 0 : 40);
      return [
        ...ns,
        {
          id,
          type: "groundNode",
          position: { x, y },
          data: { kind: "ground" },
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

  const onCompare = async () => {
    setComparing(true);
    setCompareRows(null);
    const circuit = flowToCircuit(nodes, edges);
    const capIds = circuit.nodes.filter((n) => n.kind === "capacitor").map((n) => n.id);
    const capStates = loadAllCapStates(capIds);
    const seedMap: Record<string, string> = {};
    for (const s of seeds) seedMap[s.slug] = s.body;
    const modes: CircuitMode[] = ["physics", "refine-vote", "chain-ensemble"];
    const results = await Promise.all(
      modes.map((m) =>
        runCircuit({ circuit, mode: m, prompt, capStates, seeds: seedMap }, undefined, cfCreds ?? undefined)
      )
    );
    setCompareRows(modes.map((m, i) => ({ mode: m, response: results[i]! })));
    setComparing(false);
  };

  const onRun = async () => {
    setRunning(true);
    setResponse(null);
    setNodes((ns) =>
      ns.map((n) => ({
        ...n,
        data: {
          ...(n.data as object),
          trace: { nodeId: n.id, kind: (n.data as any).kind, status: "pending" as const },
        },
      }))
    );
    const circuit = flowToCircuit(nodes, edges);
    const capIds = circuit.nodes.filter((n) => n.kind === "capacitor").map((n) => n.id);
    const capStates = loadAllCapStates(capIds);
    const seedMap: Record<string, string> = {};
    for (const s of seeds) seedMap[s.slug] = s.body;
    const res = await runCircuit(
      { circuit, mode, prompt, capStates, seeds: seedMap },
      (trace) => {
        setNodes((ns) =>
          ns.map((n) => (n.id === trace.nodeId ? { ...n, data: { ...(n.data as object), trace } } : n))
        );
      },
      cfCreds ?? undefined
    );
    setResponse(res);
    setRunning(false);
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)_340px]">
      {/* Left sidebar */}
      <aside className="space-y-0 rounded-md border border-stone-200 bg-white p-4 text-sm shadow-sm dark:border-stone-800 dark:bg-stone-950">
        <div className="sidebar-section">
          <SectionHeader label="Canvas" />
          <button onClick={newCanvas} className="w-full rounded px-2 py-1.5 text-left text-xs text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100">
            <span className="mr-1.5 text-stone-300 dark:text-stone-700">+</span>New canvas
          </button>
          <button onClick={copyShareLink} className="w-full rounded px-2 py-1.5 text-left text-xs text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100">
            <span className="mr-1.5 text-stone-300 dark:text-stone-700">⎘</span>Share link
            {shareMsg && <span className="ml-1 text-[10px] text-emerald-500">{shareMsg}</span>}
          </button>
          <button
            onClick={() => {
              const c = flowToCircuit(nodes, edges);
              const name = window.prompt("MCP tool name (no spaces)", "llm-circuit") || "llm-circuit";
              const desc = window.prompt("Description", "Custom LLM circuit") || "Custom LLM circuit";
              downloadMcpToolSpec(exportAsMcpTool(c, name.trim().replace(/\s+/g, "-"), desc));
            }}
            className="w-full rounded px-2 py-1.5 text-left text-xs text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
          >
            <span className="mr-1.5 text-stone-300 dark:text-stone-700">⤓</span>Export as MCP tool
          </button>
          <button onClick={resetEverything} className="w-full rounded px-2 py-1.5 text-left text-xs text-rose-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:text-rose-600 dark:hover:bg-stone-900 dark:hover:text-rose-400">
            <span className="mr-1.5">⟲</span>Reset
          </button>
        </div>

        <div className="sidebar-section">
          <SectionHeader label="Presets" />
          <div className="flex flex-col gap-0.5">
            {Object.entries(PRESETS).map(([k, p]) => (
              <button key={k} onClick={() => loadPreset(k as keyof typeof PRESETS)} className="group w-full rounded px-2 py-1.5 text-left text-xs text-stone-600 transition-colors hover:bg-orange-50 hover:text-[#f6821f] dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-[#f6821f]">
                <span className="mr-1.5 text-stone-300 transition-colors group-hover:text-[#f6821f] dark:text-stone-700">→</span>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-section">
          <SectionHeader label="Resistance / LLM" />
          <div className="flex flex-col gap-0.5">
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => addModelNode(m.id)}
                className="group w-full rounded px-2 py-1.5 text-left text-xs text-stone-600 transition-colors hover:bg-orange-50 dark:text-stone-400 dark:hover:bg-stone-900"
                title={m.description}
              >
                <div className="flex items-center justify-between">
                  <span>
                    <span className="mr-1 opacity-50 transition-opacity group-hover:opacity-100" style={{ color: "#f6821f" }}>⊡</span>
                    {m.label}
                  </span>
                  <span className="tabular-nums text-[10px] text-stone-400 transition-colors group-hover:text-[#f6821f] dark:text-stone-600">{m.R}Ω</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-section">
          <SectionHeader label="Capacitance / Memory" />
          <div className="flex flex-col gap-0.5">
            {seeds.map((s) => (
              <button
                key={s.slug}
                onClick={() => addCapacitor(s.slug)}
                className="w-full rounded px-2 py-1.5 text-left text-xs text-stone-600 transition-colors hover:bg-sky-50 hover:text-sky-700 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-sky-400"
              >
                <span className="mr-1 text-sky-400 opacity-60">⊓</span>{s.title}
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-section">
          <SectionHeader label="Inductance / Stability" />
          <div className="flex flex-col gap-0.5">
            <button onClick={addInductor} className="w-full rounded px-2 py-1.5 text-left text-xs text-stone-600 transition-colors hover:bg-violet-50 hover:text-violet-700 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-violet-400">
              <span className="mr-1 text-violet-400 opacity-60">∿</span>Inductor
            </button>
          </div>
        </div>

        <div className="sidebar-section">
          <SectionHeader label="Gates / Reformat / Sink" />
          <div className="flex flex-col gap-0.5">
            <button onClick={addDiode} className="w-full rounded px-2 py-1.5 text-left text-xs text-stone-600 transition-colors hover:bg-rose-50 hover:text-rose-700 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-rose-400">
              <span className="mr-1 text-rose-400 opacity-60">▷|</span>Diode
            </button>
            <button onClick={addTransformer} className="w-full rounded px-2 py-1.5 text-left text-xs text-stone-600 transition-colors hover:bg-amber-50 hover:text-amber-700 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-amber-400">
              <span className="mr-1 text-amber-400 opacity-60">⊜</span>Transformer
            </button>
            <button onClick={addGround} className="w-full rounded px-2 py-1.5 text-left text-xs text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100">
              <span className="mr-1 text-stone-400 opacity-60">⏚</span>Ground
            </button>
          </div>
        </div>

        <div className="sidebar-section">
          <SectionHeader label="Mode" />
          <div role="radiogroup" aria-label="Execution mode" className="flex flex-col gap-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={mode === m.id}
                onClick={() => setMode(m.id)}
                className={`w-full rounded border px-2 py-2 text-left transition-colors ${
                  mode === m.id
                    ? "border-[#f6821f] bg-[#f6821f0c] dark:bg-[#f6821f0a]"
                    : "border-transparent hover:border-stone-200 hover:bg-stone-50 dark:hover:border-stone-800 dark:hover:bg-stone-900"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full transition-colors ${mode === m.id ? "bg-[#f6821f]" : "bg-stone-300 dark:bg-stone-700"}`} />
                  <span className={`text-xs font-bold ${mode === m.id ? "text-stone-900 dark:text-stone-100" : "text-stone-600 dark:text-stone-400"}`}>
                    {m.label}
                  </span>
                </div>
                <div className="mt-0.5 pl-3 text-[10px] leading-snug text-stone-400 dark:text-stone-600">{m.blurb}</div>
              </button>
            ))}
          </div>
        </div>

      </aside>

      {/* Canvas */}
      <div className={`relative ${isMobile ? "min-h-[420px] h-[60vh]" : "min-h-[520px] h-[calc(100vh-220px)]"} max-h-[1200px] overflow-hidden rounded-md border border-stone-200 bg-[#faf9f6] shadow-sm dark:border-stone-800 dark:bg-stone-950`}>
        {nodes.length === 0 && (
          <div className="canvas-empty-hint">
            <div className="canvas-empty-hint__symbol">⊡—⊡</div>
            <div className="text-[11px] opacity-40">Canvas is clear</div>
            <div className="text-[10px] opacity-25">Load a preset from the left, or drag in components</div>
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} color={isDark ? "#292524" : "#e8e0d8"} />
          <Controls />
          <MiniMap pannable zoomable className="!bg-white dark:!bg-stone-900" />
        </ReactFlow>
      </div>

      {/* Right output panel */}
      <aside className="space-y-3 rounded-md border border-stone-200 bg-white p-4 text-sm shadow-sm dark:border-stone-800 dark:bg-stone-950">
        <div>
          <label className="mb-1.5 flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-[0.16em] text-stone-400 dark:text-stone-600">
              <span className="mr-1 inline-block h-px w-3 bg-stone-300 dark:bg-stone-700" />
              Voltage (Prompt)
            </span>
            <span className="ml-auto tabular-nums text-[10px] text-stone-300 dark:text-stone-700">{prompt.length} ch</span>
          </label>
          <textarea
            className="h-36 w-full resize-none rounded border border-stone-200 bg-stone-50 p-2.5 text-xs leading-relaxed text-stone-800 placeholder-stone-300 transition-colors focus:border-[#f6821f] focus:outline-none focus:ring-1 focus:ring-[#f6821f] dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100 dark:placeholder-stone-700 dark:focus:border-[#f6821f]"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter your prompt…"
          />
        </div>

        <button
          onClick={onRun}
          disabled={running || comparing}
          className={`relative w-full rounded px-3 py-2.5 font-bold tracking-wide text-white transition-all ${
            running ? "cursor-not-allowed bg-[#e5741a]" : "bg-[#f6821f] hover:bg-[#e5741a] active:scale-[0.98]"
          }`}
          style={{ fontFamily: "'Chakra Petch', monospace" }}
        >
          <span className={`absolute inset-0 rounded ${running ? "animate-scan" : ""}`} />
          <span className="relative flex items-center justify-center gap-2">
            {running ? (
              <>
                <Spinner />
                Running…
              </>
            ) : (
              <>⚡ Apply Current</>
            )}
          </span>
        </button>

        <button
          onClick={onCompare}
          disabled={running || comparing}
          className="w-full rounded border border-stone-300 bg-white px-3 py-1.5 text-[11px] font-bold tracking-wide text-stone-700 transition-colors hover:border-[#f6821f] hover:text-[#f6821f] disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
        >
          {comparing ? "Comparing 3 modes…" : "⇅ Compare 3 modes"}
        </button>

        {compareRows && (
          <div>
            <h4 className="mb-1.5 flex items-center gap-2 text-[9px] uppercase tracking-[0.16em] text-stone-400 dark:text-stone-600">
              <span className="inline-block h-px w-3 bg-amber-400" />
              Mode comparison
            </h4>
            <CompareTable rows={compareRows} />
          </div>
        )}

        {response?.error && (
          <div className="rounded bg-rose-50 p-2 text-xs text-rose-600 dark:bg-rose-950 dark:text-rose-300">{response.error}</div>
        )}

        {response?.rTotal != null && (
          <div className="stat-callout">
            <span className="stat-callout__label">Circuit Impedance</span>
            <div className="flex items-baseline gap-1">
              <span className="stat-callout__value">{response.rTotal.toFixed(1)}</span>
              <span className="stat-callout__unit">Ω</span>
            </div>
          </div>
        )}

        {response?.telemetry && (
          <div className="grid grid-cols-3 gap-2 rounded border border-stone-200 bg-stone-50 p-2 text-[10px] dark:border-stone-800 dark:bg-stone-900">
            <div>
              <div className="text-stone-400 dark:text-stone-600">calls</div>
              <div className="tabular-nums font-bold text-stone-800 dark:text-stone-100">{response.telemetry.calls}</div>
            </div>
            <div>
              <div className="text-stone-400 dark:text-stone-600">total ms</div>
              <div className="tabular-nums font-bold text-stone-800 dark:text-stone-100">{response.telemetry.ms}</div>
            </div>
            <div>
              <div className="text-stone-400 dark:text-stone-600">{response.telemetry.gatewayUsed ? "cached" : "gateway"}</div>
              <div className="tabular-nums font-bold text-stone-800 dark:text-stone-100">
                {response.telemetry.gatewayUsed ? `${response.telemetry.cached}/${response.telemetry.calls}` : "off"}
              </div>
            </div>
          </div>
        )}

        {response?.evalResult && (
          <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            <span className="rounded bg-amber-200 px-1.5 py-0.5 font-bold tabular-nums dark:bg-amber-800">
              {response.evalResult.score}/10
            </span>
            <span className="flex-1 leading-snug">{response.evalResult.rationale || "(no rationale)"}</span>
          </div>
        )}

        {response?.finalOutput && (
          <div>
            <h4 className="mb-1.5 flex items-center gap-2 text-[9px] uppercase tracking-[0.16em] text-stone-400 dark:text-stone-600">
              <span className="inline-block h-px w-3 bg-emerald-400" />
              Final Output
            </h4>
            <div className="max-h-80 overflow-y-auto rounded border border-stone-200 bg-stone-50 p-3 text-xs leading-relaxed text-stone-800 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100">
              <FormattedOutput text={response.finalOutput} />
            </div>
          </div>
        )}

        {response?.trace && response.trace.length > 0 && (
          <div>
            <h4 className="mb-1.5 flex items-center gap-2 text-[9px] uppercase tracking-[0.16em] text-stone-400 dark:text-stone-600">
              <span className="inline-block h-px w-3 bg-stone-300 dark:bg-stone-700" />
              Per-node trace
            </h4>
            <div className="space-y-1">
              {response.trace.map((t) => (
                <details key={t.nodeId} className="group overflow-hidden rounded border border-stone-200 bg-stone-50 text-[11px] dark:border-stone-800 dark:bg-stone-900">
                  <summary className="flex cursor-pointer select-none list-none items-center gap-2 px-2.5 py-2 transition-colors hover:bg-stone-100 dark:hover:bg-stone-800">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      t.status === "done" ? "bg-emerald-400" :
                      t.status === "error" ? "bg-rose-400" :
                      t.status === "running" ? "bg-[#f6821f] animate-pulse" :
                      "bg-stone-300 dark:bg-stone-700"
                    }`} />
                    <span className="flex-1 truncate font-bold text-stone-800 dark:text-stone-100">
                      {t.modelId ? t.modelId.split("/").pop() : t.kind}
                    </span>
                    <span className="shrink-0 tabular-nums text-[10px] text-stone-400 dark:text-stone-600">
                      {t.status}{t.maxTokens != null && ` · ${t.maxTokens}tk`}
                    </span>
                    <svg className="h-3 w-3 shrink-0 text-stone-400 transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </summary>
                  {(t.output || t.error) && (
                    <div className="border-t border-stone-200 px-2.5 py-2 dark:border-stone-800">
                      {t.output && <div className="whitespace-pre-wrap leading-relaxed text-stone-700 dark:text-stone-300">{t.output}</div>}
                      {t.error && <div className="text-rose-500 dark:text-rose-400">{t.error}</div>}
                    </div>
                  )}
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
