import { useEffect, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { MODELS } from "@/lib/models";
import type { NodeTrace } from "@/lib/runner";
import { useIsMobile } from "@/lib/useIsMobile";

export interface TransformerNodeData {
  instruction: string;
  modelId: string;
  trace?: NodeTrace;
  onChangeInstruction?: (s: string) => void;
  onChangeModel?: (id: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "border-stone-200 dark:border-stone-700",
  running: "border-[#f6821f]",
  done: "border-amber-400",
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
  done: "bg-amber-400",
  error: "bg-rose-400",
};

export default function TransformerNode({ data }: { data: TransformerNodeData }) {
  const status = data.trace?.status ?? "pending";
  const isMobile = useIsMobile();
  const targetPos = isMobile ? Position.Top : Position.Left;
  const sourcePos = isMobile ? Position.Bottom : Position.Right;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.instruction);
  useEffect(() => {
    if (!editing) setDraft(data.instruction);
  }, [data.instruction, editing]);

  return (
    <div className={`w-[240px] rounded border-2 ${STATUS_COLORS[status]} ${STATUS_RING[status]} bg-white p-3 text-sm text-stone-800 dark:bg-stone-900 dark:text-stone-100 transition-shadow`}>
      <Handle type="target" position={targetPos} style={{ width: 12, height: 12, background: "#fbbf24", border: "2px solid #fff" }} />

      <div className="mb-2 flex items-center gap-2">
        <span className="select-none text-base leading-none text-amber-400 opacity-70">⊜</span>
        <span className="flex-1 text-xs font-bold text-stone-900 dark:text-stone-100">Transformer</span>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[status]}`} />
      </div>

      <select
        className="nodrag nowheel w-full rounded border border-stone-100 bg-stone-50 px-1.5 py-1 text-[11px] text-stone-700 transition-colors hover:border-stone-200 focus:border-amber-400 focus:outline-none dark:border-stone-800 dark:bg-stone-800 dark:text-stone-200"
        value={data.modelId}
        onChange={(e) => data.onChangeModel?.(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </select>

      <button
        className="nodrag mt-1 w-full rounded bg-stone-100 px-1 py-0.5 text-[11px] text-stone-600 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
        onClick={(e) => { e.stopPropagation(); setEditing((v) => !v); }}
      >
        {editing ? "cancel" : "✎ instruction"}
      </button>

      {editing && (
        <div className="nodrag nowheel mt-1">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="h-20 w-full rounded border border-stone-200 bg-stone-50 p-1 text-[11px] text-stone-800 focus:border-amber-400 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
            placeholder="e.g. Translate to French. Reply with only the translation."
          />
          <button
            className="mt-1 w-full rounded bg-emerald-500 px-1 py-0.5 text-[11px] font-bold text-white hover:bg-emerald-600"
            onClick={(e) => {
              e.stopPropagation();
              data.onChangeInstruction?.(draft);
              setEditing(false);
            }}
          >
            save
          </button>
        </div>
      )}

      {!editing && (
        <div className="mt-1 line-clamp-2 text-[10px] italic text-stone-400 dark:text-stone-600">{data.instruction}</div>
      )}

      {data.trace?.status === "running" && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[#f6821f]">
          <svg className="animate-spin-cw h-2.5 w-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
          </svg>
          transforming…
        </div>
      )}

      <Handle type="source" position={sourcePos} style={{ width: 12, height: 12, background: "#fbbf24", border: "2px solid #fff" }} />
    </div>
  );
}
