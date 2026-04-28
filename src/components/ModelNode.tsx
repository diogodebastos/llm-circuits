import { Handle, Position } from "@xyflow/react";
import { MODELS } from "@/lib/models";
import type { NodeTrace } from "@/lib/runner";

export interface ModelNodeData {
  modelId: string;
  trace?: NodeTrace;
  onChangeModel?: (id: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "border-stone-200 dark:border-stone-700",
  running: "border-[#f6821f] animate-pulse",
  done: "border-emerald-500",
  error: "border-rose-500",
};

export default function ModelNode({ data }: { data: ModelNodeData }) {
  const status = data.trace?.status ?? "pending";
  const model = MODELS.find((m) => m.id === data.modelId);
  return (
    <div className={`min-w-[200px] rounded-md border-2 ${STATUS_COLORS[status]} bg-white p-3 text-sm text-stone-800 dark:bg-stone-900 dark:text-stone-100`}>
      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 14, height: 14, background: "#f6821f", border: "2px solid #fff" }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold">{model?.label ?? data.modelId}</span>
        <span className="text-xs text-stone-400 dark:text-stone-500">R={model?.R}Ω</span>
      </div>
      <select
        className="nodrag nowheel mt-2 w-full rounded bg-stone-100 px-1 py-0.5 text-xs text-stone-700 dark:bg-stone-800 dark:text-stone-200"
        value={data.modelId}
        onChange={(e) => data.onChangeModel?.(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      {data.trace?.status === "done" && (
        <div className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400">✓ done · {(data.trace.output ?? "").length} chars</div>
      )}
      {data.trace?.status === "running" && <div className="mt-2 text-[11px] text-[#f6821f]">running…</div>}
      {data.trace?.error && <div className="mt-2 text-[11px] text-rose-500 dark:text-rose-400">{data.trace.error}</div>}
      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 14, height: 14, background: "#f6821f", border: "2px solid #fff" }}
      />
    </div>
  );
}
