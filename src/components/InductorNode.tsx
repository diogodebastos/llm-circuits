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

export default function InductorNode({ data }: { data: InductorNodeData }) {
  const status = data.trace?.status ?? "pending";
  return (
    <div className={`min-w-[180px] rounded-md border-2 ${STATUS_COLORS[status]} bg-white p-3 text-sm text-stone-800 dark:bg-stone-900 dark:text-stone-100`}>
      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 14, height: 14, background: "#c4b5fd", border: "2px solid #fff" }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold">∿ Inductor</span>
        <span className="text-xs text-stone-400 dark:text-stone-500">×{data.runs}</span>
      </div>
      <label className="mt-2 block text-[11px] text-stone-500 dark:text-stone-400">
        runs (resists change)
        <input
          type="number"
          min={1}
          max={7}
          value={data.runs}
          onChange={(e) => data.onChangeRuns?.(Math.max(1, Math.min(7, Number(e.target.value))))}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="nodrag nowheel mt-1 w-full rounded bg-stone-100 px-1 py-0.5 text-xs text-stone-700 dark:bg-stone-800 dark:text-stone-200"
        />
      </label>
      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 14, height: 14, background: "#c4b5fd", border: "2px solid #fff" }}
      />
    </div>
  );
}
