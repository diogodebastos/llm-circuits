import { useEffect, useRef } from "react";
import type { Edge, Node } from "@xyflow/react";
import type { Circuit } from "@/lib/graph";
import { saveAutosave, writeHashCircuit } from "@/lib/persist";

/**
 * Debounced autosave + URL-hash sync. Drops both into localStorage and the
 * URL fragment 400 ms after the last edit so share-links stay in sync without
 * thrashing.
 */
export function usePersist(
  nodes: Node[],
  edges: Edge[],
  toCircuit: (n: Node[], e: Edge[]) => Circuit,
  delayMs = 400
) {
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const c = toCircuit(nodes, edges);
      saveAutosave(c);
      writeHashCircuit(c);
    }, delayMs);
  }, [nodes, edges, toCircuit, delayMs]);
}
