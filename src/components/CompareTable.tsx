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
  return (
    <div className="overflow-x-auto rounded border border-stone-200 dark:border-stone-800">
      <table className="w-full text-[10px] tabular-nums">
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
            <tr key={mode} className="border-t border-stone-100 dark:border-stone-800">
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
              <td className="max-w-[260px] truncate px-2 py-1.5 text-stone-600 dark:text-stone-400" title={response.finalOutput}>
                {response.error ? <span className="text-rose-500">{response.error}</span> : response.finalOutput}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
