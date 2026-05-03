import type { CircuitMode } from "./graph";

export interface HistoryEntry {
  ts: number;
  mode: CircuitMode;
  rTotal?: number;
  ms?: number;
  calls?: number;
  cached?: number;
  evalScore?: number;
  ok: boolean;
}

const KEY = "llm-circuits:history";
const CAP = 20;

export function loadHistory(): HistoryEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function pushHistory(entry: HistoryEntry): HistoryEntry[] {
  if (typeof localStorage === "undefined") return [];
  const cur = loadHistory();
  const next = [...cur, entry].slice(-CAP);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function clearHistory() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(KEY);
}
