import { useEffect, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import type { DiodeGate, DiodeOnFail } from "@/lib/graph";
import type { NodeTrace } from "@/lib/runner";
import { useIsMobile } from "@/lib/useIsMobile";

export interface DiodeNodeData {
  gate: DiodeGate;
  pattern?: string;
  rubric?: string;
  onFail: DiodeOnFail;
  trace?: NodeTrace;
  onChangeGate?: (g: DiodeGate) => void;
  onChangePattern?: (p: string) => void;
  onChangeRubric?: (r: string) => void;
  onChangeOnFail?: (m: DiodeOnFail) => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "border-stone-200 dark:border-stone-700",
  running: "border-[#f6821f]",
  done: "border-rose-400",
  error: "border-rose-500",
};
const STATUS_RING: Record<string, string> = {
  pending: "",
  running: "node-running",
  done: "node-done",
  error: "node-error",
};
const STATUS_DOT: Record<string, string> = {
  pending: "bg-stone-300 dark:bg-stone-700",
  running: "bg-[#f6821f] animate-pulse",
  done: "bg-rose-400",
  error: "bg-rose-500",
};

export default function DiodeNode({ data }: { data: DiodeNodeData }) {
  const status = data.trace?.status ?? "pending";
  const isMobile = useIsMobile();
  const targetPos = isMobile ? Position.Top : Position.Left;
  const sourcePos = isMobile ? Position.Bottom : Position.Right;
  const [editing, setEditing] = useState(false);
  const [draftPattern, setDraftPattern] = useState(data.pattern ?? "");
  const [draftRubric, setDraftRubric] = useState(data.rubric ?? "");
  useEffect(() => {
    if (!editing) {
      setDraftPattern(data.pattern ?? "");
      setDraftRubric(data.rubric ?? "");
    }
  }, [data.pattern, data.rubric, editing]);

  return (
    <div className={`w-[230px] rounded border-2 ${STATUS_COLORS[status]} ${STATUS_RING[status]} bg-white p-3 text-sm text-stone-800 dark:bg-stone-900 dark:text-stone-100 transition-shadow`}>
      <Handle type="target" position={targetPos} style={{ width: 12, height: 12, background: "#fb7185", border: "2px solid #fff" }} />

      <div className="mb-2 flex items-center gap-2">
        <span className="select-none text-base leading-none text-rose-400 opacity-70">▷|</span>
        <span className="flex-1 text-xs font-bold text-stone-900 dark:text-stone-100">Diode</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
          <span className="text-[10px] tabular-nums text-stone-400 dark:text-stone-600">{data.gate}</span>
        </div>
      </div>

      <select
        className="nodrag nowheel w-full rounded border border-stone-100 bg-stone-50 px-1.5 py-1 text-[11px] text-stone-700 transition-colors hover:border-stone-200 focus:border-rose-400 focus:outline-none dark:border-stone-800 dark:bg-stone-800 dark:text-stone-200"
        value={data.gate}
        onChange={(e) => data.onChangeGate?.(e.target.value as DiodeGate)}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <option value="judge">judge LLM</option>
        <option value="regex">regex</option>
      </select>

      <select
        className="nodrag nowheel mt-1 w-full rounded border border-stone-100 bg-stone-50 px-1.5 py-1 text-[11px] text-stone-700 transition-colors hover:border-stone-200 focus:border-rose-400 focus:outline-none dark:border-stone-800 dark:bg-stone-800 dark:text-stone-200"
        value={data.onFail}
        onChange={(e) => data.onChangeOnFail?.(e.target.value as DiodeOnFail)}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <option value="block">on fail: block</option>
        <option value="passthrough">on fail: passthrough</option>
      </select>

      <button
        className="nodrag mt-1 w-full rounded bg-stone-100 px-1 py-0.5 text-[11px] text-stone-600 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
        onClick={(e) => { e.stopPropagation(); setEditing((v) => !v); }}
      >
        {editing ? "cancel" : "✎ edit gate"}
      </button>

      {editing && (
        <div className="nodrag nowheel mt-1 space-y-1">
          {data.gate === "regex" ? (
            <input
              type="text"
              value={draftPattern}
              onChange={(e) => setDraftPattern(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-full rounded border border-stone-200 bg-stone-50 p-1 font-mono text-[11px] text-stone-800 focus:border-rose-400 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
              placeholder="regex pattern (case-insensitive)"
            />
          ) : (
            <textarea
              value={draftRubric}
              onChange={(e) => setDraftRubric(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="h-20 w-full rounded border border-stone-200 bg-stone-50 p-1 text-[11px] text-stone-800 focus:border-rose-400 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
              placeholder="judge rubric (yes/no question)"
            />
          )}
          <button
            className="w-full rounded bg-emerald-500 px-1 py-0.5 text-[11px] font-bold text-white hover:bg-emerald-600"
            onClick={(e) => {
              e.stopPropagation();
              if (data.gate === "regex") data.onChangePattern?.(draftPattern);
              else data.onChangeRubric?.(draftRubric);
              setEditing(false);
            }}
          >
            save
          </button>
        </div>
      )}

      {data.trace?.status === "done" && data.trace.output && (
        <div className="mt-2 truncate text-[10px] text-rose-500 dark:text-rose-400">{data.trace.output}</div>
      )}
      {data.trace?.error && (
        <div className="mt-2 break-words text-[10px] text-rose-500 dark:text-rose-400">✕ {data.trace.error}</div>
      )}

      <Handle type="source" position={sourcePos} style={{ width: 12, height: 12, background: "#fb7185", border: "2px solid #fff" }} />
    </div>
  );
}
