import { Handle, Position } from "@xyflow/react";
import { MODELS } from "@/lib/models";
import type { NodeTrace } from "@/lib/runner";
import { useIsMobile } from "@/lib/useIsMobile";

export interface ModelNodeData {
  modelId: string;
  trace?: NodeTrace;
  onChangeModel?: (id: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "border-stone-200 dark:border-stone-700",
  running: "border-[#f6821f]",
  done: "border-emerald-500",
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
  done: "bg-emerald-400",
  error: "bg-rose-400",
};

export default function ModelNode({ data }: { data: ModelNodeData }) {
  const status = data.trace?.status ?? "pending";
  const model = MODELS.find((m) => m.id === data.modelId);
  const isMobile = useIsMobile();
  const targetPos = isMobile ? Position.Top : Position.Left;
  const sourcePos = isMobile ? Position.Bottom : Position.Right;
  return (
    <div className={`w-[210px] rounded border-2 ${STATUS_COLORS[status]} ${STATUS_RING[status]} bg-white p-3 text-sm text-stone-800 dark:bg-stone-900 dark:text-stone-100 transition-shadow`}>
      <Handle
        type="target"
        position={targetPos}
        style={{ width: 12, height: 12, background: "#f6821f", border: "2px solid #fff" }}
      />

      <div className="mb-2 flex items-center gap-2">
        <span className="select-none text-base leading-none text-[#f6821f] opacity-70">⊡</span>
        <span className="flex-1 truncate text-xs font-bold text-stone-900 dark:text-stone-100">
          {model?.label ?? data.modelId.split("/").pop()}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
          <span className="text-[10px] tabular-nums text-stone-400 dark:text-stone-600">{model?.R}Ω</span>
        </div>
      </div>

      <select
        className="nodrag nowheel w-full rounded border border-stone-100 bg-stone-50 px-1.5 py-1 text-[11px] text-stone-700 transition-colors hover:border-stone-200 focus:border-[#f6821f] focus:outline-none dark:border-stone-800 dark:bg-stone-800 dark:text-stone-200 dark:hover:border-stone-700"
        value={data.modelId}
        onChange={(e) => data.onChangeModel?.(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label} ({m.R}Ω)
          </option>
        ))}
      </select>

      {data.trace?.status === "running" && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[#f6821f]">
          <svg className="animate-spin-cw h-2.5 w-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
          </svg>
          computing…
        </div>
      )}
      {data.trace?.status === "done" && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-emerald-500 dark:text-emerald-400">
          <span>✓</span>
          <span className="tabular-nums">{(data.trace.output ?? "").length} chars</span>
        </div>
      )}
      {data.trace?.error && (
        <div className="mt-2 break-words text-[10px] text-rose-500 dark:text-rose-400">
          ✕ {data.trace.error}
        </div>
      )}

      <Handle
        type="source"
        position={sourcePos}
        style={{ width: 12, height: 12, background: "#f6821f", border: "2px solid #fff" }}
      />
    </div>
  );
}
