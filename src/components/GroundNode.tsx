import { Handle, Position } from "@xyflow/react";
import type { NodeTrace } from "@/lib/runner";
import { useIsMobile } from "@/lib/useIsMobile";

export interface GroundNodeData {
  trace?: NodeTrace;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "border-stone-200 dark:border-stone-700",
  running: "border-stone-400",
  done: "border-stone-500",
  error: "border-rose-500",
};

export default function GroundNode({ data }: { data: GroundNodeData }) {
  const status = data.trace?.status ?? "pending";
  const isMobile = useIsMobile();
  const targetPos = isMobile ? Position.Top : Position.Left;
  return (
    <div className={`flex w-[140px] flex-col items-center rounded border-2 ${STATUS_COLORS[status]} bg-white p-3 text-sm text-stone-800 dark:bg-stone-900 dark:text-stone-100`}>
      <Handle type="target" position={targetPos} style={{ width: 12, height: 12, background: "#78716c", border: "2px solid #fff" }} />

      <div className="mb-1 flex items-center gap-2">
        <span className="select-none text-base leading-none text-stone-500 opacity-80">⏚</span>
        <span className="text-xs font-bold text-stone-900 dark:text-stone-100">Ground</span>
      </div>

      <svg viewBox="0 0 40 28" className="h-6 w-10 text-stone-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="20" y1="0" x2="20" y2="10" />
        <line x1="6" y1="10" x2="34" y2="10" />
        <line x1="11" y1="16" x2="29" y2="16" />
        <line x1="16" y1="22" x2="24" y2="22" />
      </svg>

      {data.trace?.status === "done" && (
        <div className="mt-1 text-[9px] text-stone-400 dark:text-stone-600">silenced</div>
      )}
    </div>
  );
}
