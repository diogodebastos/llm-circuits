import { Handle, Position } from "@xyflow/react";
import type { NodeTrace } from "@/lib/runner";

export interface InductorNodeData {
  runs: number;
  trace?: NodeTrace;
  onChangeRuns?: (n: number) => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "border-stone-200 dark:border-stone-700",
  running: "border-[#f6821f]",
  done: "border-violet-400",
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
  done: "bg-violet-400",
  error: "bg-rose-400",
};

export default function InductorNode({ data }: { data: InductorNodeData }) {
  const status = data.trace?.status ?? "pending";
  return (
    <div className={`min-w-[180px] rounded border-2 ${STATUS_COLORS[status]} ${STATUS_RING[status]} bg-white p-3 text-sm text-stone-800 dark:bg-stone-900 dark:text-stone-100 transition-shadow`}>
      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 12, height: 12, background: "#c4b5fd", border: "2px solid #fff" }}
      />

      <div className="mb-2 flex items-center gap-2">
        <span className="select-none text-base leading-none text-violet-400 opacity-70">∿</span>
        <span className="flex-1 text-xs font-bold text-stone-900 dark:text-stone-100">Inductor</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
          <span className="text-[10px] tabular-nums text-violet-300 dark:text-violet-600">×{data.runs}</span>
        </div>
      </div>

      <label className="block text-[11px] text-stone-500 dark:text-stone-400">
        runs (resists change)
        <input
          type="number"
          min={1}
          max={7}
          value={data.runs}
          onChange={(e) => data.onChangeRuns?.(Math.max(1, Math.min(7, Number(e.target.value))))}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="nodrag nowheel mt-1 w-full rounded border border-stone-100 bg-stone-50 px-1.5 py-1 text-xs text-stone-700 focus:border-violet-400 focus:outline-none dark:border-stone-800 dark:bg-stone-800 dark:text-stone-200"
        />
      </label>

      {data.trace?.status === "running" && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[#f6821f]">
          <svg className="animate-spin-cw h-2.5 w-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
          </svg>
          computing…
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 12, height: 12, background: "#c4b5fd", border: "2px solid #fff" }}
      />
    </div>
  );
}
