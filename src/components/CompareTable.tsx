import { useState } from "react";
import type { CircuitMode } from "@/lib/graph";
import type { RunResponse } from "@/lib/runner";

export interface CompareRow {
  mode: CircuitMode;
  response: RunResponse;
}

const LABEL: Record<CircuitMode, string> = {
  "physics": "Physics",
  "refine-vote": "Refine/Vote",
  "chain-ensemble": "Chain/Ens.",
};

export default function CompareTable({ rows }: { rows: CompareRow[] }) {
  const [hovered, setHovered] = useState<CircuitMode | null>(null);
  const active = rows.find((r) => r.mode === hovered) ?? null;

  return (
    <div className="rounded border border-stone-200 dark:border-stone-800">
      <table className="w-full table-fixed text-[10px] tabular-nums">
        <colgroup>
          <col style={{ width: "22%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "20%" }} />
        </colgroup>
        <thead className="bg-stone-50 text-stone-500 dark:bg-stone-900 dark:text-stone-400">
          <tr>
            <th className="px-2 py-1 text-left font-normal uppercase tracking-wider">Mode</th>
            <th className="px-2 py-1 text-right font-normal uppercase tracking-wider">R</th>
            <th className="px-2 py-1 text-right font-normal uppercase tracking-wider">ms</th>
            <th className="px-2 py-1 text-right font-normal uppercase tracking-wider">calls</th>
            <th className="px-2 py-1 text-right font-normal uppercase tracking-wider">cached</th>
            <th className="px-2 py-1 text-right font-normal uppercase tracking-wider">eval</th>
            <th className="px-2 py-1 text-left font-normal uppercase tracking-wider">output</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ mode, response }) => (
            <tr
              key={mode}
              className={`cursor-help border-t border-stone-100 transition-colors hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-900 ${
                hovered === mode ? "bg-stone-50 dark:bg-stone-900" : ""
              }`}
              onMouseEnter={() => setHovered(mode)}
              onMouseLeave={() => setHovered((h) => (h === mode ? null : h))}
            >
              <td className="px-2 py-1.5 font-bold text-stone-800 dark:text-stone-100">{LABEL[mode]}</td>
              <td className="px-2 py-1.5 text-right text-stone-600 dark:text-stone-400">{response.rTotal != null ? response.rTotal.toFixed(1) : "—"}</td>
              <td className="px-2 py-1.5 text-right text-stone-600 dark:text-stone-400">{response.telemetry?.ms ?? "—"}</td>
              <td className="px-2 py-1.5 text-right text-stone-600 dark:text-stone-400">{response.telemetry?.calls ?? "—"}</td>
              <td className="px-2 py-1.5 text-right text-stone-600 dark:text-stone-400">{response.telemetry?.gatewayUsed ? response.telemetry.cached : "—"}</td>
              <td className="px-2 py-1.5 text-right">
                {response.evalResult ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                    {response.evalResult.score}/10
                  </span>
                ) : (
                  <span className="text-stone-400">—</span>
                )}
              </td>
              <td className="truncate px-2 py-1.5 text-stone-600 dark:text-stone-400">
                {response.error ? (
                  <span className="text-rose-500">{response.error}</span>
                ) : (
                  response.finalOutput || <span className="text-stone-400">(empty)</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {active && (active.response.finalOutput || active.response.error) && (
        <div
          className="border-t border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-900"
          onMouseEnter={() => setHovered(active.mode)}
          onMouseLeave={() => setHovered(null)}
        >
          <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-[0.16em] text-stone-400 dark:text-stone-600">
            <span>{LABEL[active.mode]} · full output</span>
            <span className="tabular-nums">{(active.response.finalOutput ?? active.response.error ?? "").length} ch</span>
          </div>
          <div className="max-h-72 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-stone-800 dark:text-stone-100">
            {active.response.error ? (
              <span className="text-rose-500">{active.response.error}</span>
            ) : (
              active.response.finalOutput
            )}
          </div>
        </div>
      )}
    </div>
  );
}
