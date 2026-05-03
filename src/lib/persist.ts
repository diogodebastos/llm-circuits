import { normalizeCircuit, type Circuit } from "./graph";

const VERSION = 1;
const AUTOSAVE_KEY = "llm-circuits:autosave";
const CAP_PREFIX = "llm-circuits:cap:";

interface Envelope {
  v: number;
  c: Circuit;
}

function toBase64Url(s: string): string {
  const utf8 = new TextEncoder().encode(s);
  let bin = "";
  for (const b of utf8) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeCircuit(c: Circuit): string {
  const env: Envelope = { v: VERSION, c };
  return toBase64Url(JSON.stringify(env));
}

export function decodeCircuit(encoded: string): Circuit | null {
  try {
    const env = JSON.parse(fromBase64Url(encoded)) as Envelope;
    return normalizeCircuit(env.c);
  } catch {
    return null;
  }
}

export function readHashCircuit(): Circuit | null {
  if (typeof window === "undefined") return null;
  const m = window.location.hash.match(/[#&]c=([^&]+)/);
  if (!m) return null;
  return decodeCircuit(m[1]!);
}

export function writeHashCircuit(c: Circuit): void {
  if (typeof window === "undefined") return;
  const enc = encodeCircuit(c);
  const newHash = `#c=${enc}`;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${newHash}`);
}

export function clearHash(): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

export function loadAutosave(): Circuit | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope;
    return normalizeCircuit(env.c);
  } catch {
    return null;
  }
}

export function saveAutosave(c: Circuit): void {
  if (typeof window === "undefined") return;
  const env: Envelope = { v: VERSION, c };
  window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(env));
}

export function clearAutosave(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTOSAVE_KEY);
}

export function loadCapState(nodeId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CAP_PREFIX + nodeId);
}

export function saveCapState(nodeId: string, text: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CAP_PREFIX + nodeId, text);
}

export function clearCapState(nodeId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CAP_PREFIX + nodeId);
}

export function loadAllCapStates(nodeIds: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of nodeIds) {
    const v = loadCapState(id);
    if (v != null) out[id] = v;
  }
  return out;
}
