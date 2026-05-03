import type { HistoryEntry } from "@/lib/history";

const COLOR: Record<string, string> = {
  "physics": "#f6821f",
  "refine-vote": "#0ea5e9",
  "chain-ensemble": "#8b5cf6",
};

export default function RunHistory({ entries, onClear }: { entries: HistoryEntry[]; onClear: () => void }) {
  if (entries.length === 0) return null;
  return (
    <div className="rounded border border-stone-200 bg-white p-2 dark:border-stone-800 dark:bg-stone-900">
      <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-[0.16em] text-stone-400 dark:text-stone-600">
        <span>Run history · last {entries.length}</span>
        <button onClick={onClear} className="text-stone-400 hover:text-rose-500 dark:text-stone-600">clear</button>
      </div>
      <div className="flex items-end gap-0.5">
        {entries.map((e, i) => {
          const color = COLOR[e.mode] ?? "#a8a29e";
          const heightPct = e.evalScore != null ? Math.max(10, e.evalScore * 10) : e.ok ? 60 : 20;
          const tooltip = `${new Date(e.ts).toLocaleTimeString()} · ${e.mode} · ${
            e.rTotal != null ? `${e.rTotal.toFixed(1)}Ω · ` : ""
          }${e.ms ?? "—"}ms · ${e.calls ?? 0} calls${
            e.cached ? ` · ${e.cached} cached` : ""
          }${e.evalScore != null ? ` · eval ${e.evalScore}/10` : ""}${e.ok ? "" : " · error"}`;
          return (
            <div
              key={i}
              title={tooltip}
              className="h-7 w-2 cursor-help rounded-sm transition-opacity hover:opacity-70"
              style={{ background: color, height: `${Math.round((heightPct / 100) * 28)}px`, opacity: e.ok ? 1 : 0.4 }}
            />
          );
        })}
      </div>
    </div>
  );
}
