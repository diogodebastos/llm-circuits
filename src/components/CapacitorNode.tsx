import { useEffect, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import type { CapacitorMode } from "@/lib/graph";
import type { NodeTrace } from "@/lib/runner";

export interface CapacitorNodeData {
  seedSlug: string;
  mode: CapacitorMode;
  storedChars?: number;
  storedText?: string;
  trace?: NodeTrace;
  seeds?: Array<{ slug: string; title: string }>;
  onChangeSeed?: (slug: string) => void;
  onChangeMode?: (mode: CapacitorMode) => void;
  onClear?: () => void;
  onSaveText?: (text: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "border-slate-700",
  running: "border-amber-400",
  done: "border-sky-400",
  error: "border-rose-500",
};

export default function CapacitorNode({ data }: { data: CapacitorNodeData }) {
  const status = data.trace?.status ?? "pending";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.storedText ?? "");
  useEffect(() => {
    if (!editing) setDraft(data.storedText ?? "");
  }, [data.storedText, editing]);
  return (
    <div className={`min-w-[210px] rounded-md border-2 ${STATUS_COLORS[status]} bg-slate-900 p-3 text-sm`}>
      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 14, height: 14, background: "#7dd3fc", border: "2px solid #0f172a" }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold">⊓ Capacitor</span>
        <span className="text-xs text-slate-400">{data.storedChars ?? 0} ch</span>
      </div>
      <select
        className="nodrag nowheel mt-2 w-full rounded bg-slate-800 px-1 py-0.5 text-xs"
        value={data.seedSlug}
        onChange={(e) => data.onChangeSeed?.(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {(data.seeds ?? []).map((s) => (
          <option key={s.slug} value={s.slug}>
            {s.title}
          </option>
        ))}
      </select>
      <select
        className="nodrag nowheel mt-1 w-full rounded bg-slate-800 px-1 py-0.5 text-[11px]"
        value={data.mode}
        onChange={(e) => data.onChangeMode?.(e.target.value as CapacitorMode)}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <option value="both">inject + absorb</option>
        <option value="inject">inject only</option>
        <option value="absorb">absorb only</option>
      </select>
      <div className="mt-1 flex gap-1">
        <button
          className="nodrag flex-1 rounded bg-slate-800 px-1 py-0.5 text-[11px] text-slate-400 hover:bg-slate-700"
          onClick={(e) => {
            e.stopPropagation();
            setEditing((v) => !v);
          }}
        >
          {editing ? "cancel" : "✎ edit"}
        </button>
        <button
          className="nodrag flex-1 rounded bg-slate-800 px-1 py-0.5 text-[11px] text-slate-400 hover:bg-slate-700"
          onClick={(e) => {
            e.stopPropagation();
            data.onClear?.();
            setEditing(false);
          }}
        >
          reset to seed
        </button>
      </div>
      {editing && (
        <div className="nodrag nowheel mt-1">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="h-24 w-full rounded bg-slate-950 p-1 text-[11px] text-slate-100"
            placeholder="(empty — will fall back to seed at run time)"
          />
          <button
            className="mt-1 w-full rounded bg-emerald-500 px-1 py-0.5 text-[11px] font-bold text-slate-900 hover:bg-emerald-400"
            onClick={(e) => {
              e.stopPropagation();
              data.onSaveText?.(draft);
              setEditing(false);
            }}
          >
            save
          </button>
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 14, height: 14, background: "#7dd3fc", border: "2px solid #0f172a" }}
      />
    </div>
  );
}
