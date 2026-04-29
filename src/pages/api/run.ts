import type { APIRoute } from "astro";
import { executeCircuit } from "@/lib/execute";
import type { RunRequest } from "@/lib/runner";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  let body: RunRequest;
  try {
    body = (await request.json()) as RunRequest;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (!body?.circuit || !body?.mode || typeof body?.prompt !== "string") {
    return new Response(JSON.stringify({ ok: false, error: "Missing circuit/mode/prompt." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const env = locals.runtime?.env as { AI?: Ai } | undefined;
  if (!env?.AI) {
    return new Response(
      JSON.stringify({ ok: false, error: "AI binding unavailable. Run with `wrangler dev --remote` or deploy." }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        const result = await executeCircuit(
          env.AI as unknown as { run: (m: string, i: any) => Promise<unknown> },
          body.circuit,
          body.mode,
          body.prompt,
          body.capStates ?? {},
          body.seeds ?? {},
          (trace) => send({ type: "node", trace })
        );
        send({ type: "done", result });
      } catch (err) {
        send({ type: "done", result: { ok: false, trace: [], error: String(err) } });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "x-accel-buffering": "no",
    },
  });
};
