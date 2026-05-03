/**
 * Capacitor — a single piece of LLM-circuit memory, addressable globally
 * by slug. Single-writer-per-id semantics, strong consistency.
 *
 * Free-tier-safe: this class is *only* loaded when the user uncomments the
 * `[[durable_objects.bindings]]` block in wrangler.toml. The /api/cap/[id]
 * route detects whether the binding is present and either proxies here or
 * returns 501 with a friendly message.
 *
 * To activate:
 *   1. Uncomment the durable_objects + migrations blocks in wrangler.toml.
 *   2. Re-export this class from your worker entrypoint (Astro Cloudflare
 *      adapter requires a small custom entry — see docs).
 *   3. `wrangler deploy`.
 */
export class Capacitor {
  state: DurableObjectState;
  constructor(state: DurableObjectState) {
    this.state = state;
  }
  async fetch(req: Request): Promise<Response> {
    if (req.method === "GET") {
      const text = (await this.state.storage.get<string>("text")) ?? "";
      return new Response(text, {
        headers: { "content-type": "text/plain", "cache-control": "no-store" },
      });
    }
    if (req.method === "PUT" || req.method === "POST") {
      const text = await req.text();
      // Soft cap to keep one capacitor from blowing the storage budget.
      if (text.length > 64 * 1024) {
        return new Response("text exceeds 64 KiB cap", { status: 413 });
      }
      await this.state.storage.put("text", text);
      return new Response("ok");
    }
    if (req.method === "DELETE") {
      await this.state.storage.delete("text");
      return new Response("ok");
    }
    return new Response("method not allowed", { status: 405 });
  }
}
