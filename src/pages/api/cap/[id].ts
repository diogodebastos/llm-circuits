import type { APIRoute } from "astro";

export const prerender = false;

interface CapsBinding {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): { fetch(req: Request): Promise<Response> };
}

interface DurableObjectId {
  toString(): string;
}

/**
 * Proxy to the Capacitor Durable Object for `id`. Returns 501 cleanly when
 * the DO binding is not configured — the free-tier path. Health probe:
 *   GET /api/cap/_health → 200 (DO available) or 501 (not configured).
 */
export const GET: APIRoute = async ({ params, locals, url }) => {
  const env = locals.runtime?.env as { CAPS?: CapsBinding } | undefined;
  const id = params.id ?? "";

  if (id === "_health") {
    return new Response(JSON.stringify({ available: !!env?.CAPS }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  if (!env?.CAPS) {
    return new Response(
      JSON.stringify({
        error: "Durable Objects binding not configured (free-tier deployment).",
        howTo: "Uncomment [[durable_objects.bindings]] in wrangler.toml; redeploy on a Workers Paid plan.",
      }),
      { status: 501, headers: { "content-type": "application/json" } }
    );
  }

  const doId = env.CAPS.idFromName(id);
  return env.CAPS.get(doId).fetch(new Request(url.toString(), { method: "GET" }));
};

export const PUT: APIRoute = async ({ params, locals, request, url }) => {
  const env = locals.runtime?.env as { CAPS?: CapsBinding } | undefined;
  const id = params.id ?? "";
  if (!env?.CAPS) {
    return new Response(JSON.stringify({ error: "Durable Objects binding not configured." }), {
      status: 501,
      headers: { "content-type": "application/json" },
    });
  }
  const doId = env.CAPS.idFromName(id);
  const body = await request.text();
  return env.CAPS.get(doId).fetch(new Request(url.toString(), { method: "PUT", body }));
};
