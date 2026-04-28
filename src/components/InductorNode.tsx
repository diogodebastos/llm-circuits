import { Handle, Position } from "@xyflow/react";
import type { NodeTrace } from "@/lib/runner";

export interface InductorNodeData {
  runs: number;
  trace?: NodeTrace;
  onChangeRuns?: (n: number) => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "border-slate-700",
  running: "border-amber-400",
  done: "border-violet-400",
  error: "border-rose-500",
};

export default function InductorNode({ data }: { data: InductorNodeData }) {
  const status = data.trace?.status ?? "pending";
  return (
    <div className={`min-w-[180px] rounded-md border-2 ${STATUS_COLORS[status]} bg-slate-900 p-3 text-sm`}>
      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 14, height: 14, background: "#c4b5fd", border: "2px solid #0f172a" }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold">∿ Inductor</span>
        <span className="text-xs text-slate-400">×{data.runs}</span>
      </div>
      <label className="mt-2 block text-[11px] text-slate-400">
        runs (resists change)
        <input
          type="number"
          min={1}
          max={7}
          value={data.runs}
          onChange={(e) => data.onChangeRuns?.(Math.max(1, Math.min(7, Number(e.target.value))))}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="nodrag nowheel mt-1 w-full rounded bg-slate-800 px-1 py-0.5 text-xs text-slate-100"
        />
      </label>
      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 14, height: 14, background: "#c4b5fd", border: "2px solid #0f172a" }}
      />
    </div>
  );
}
