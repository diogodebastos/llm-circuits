import type { APIRoute } from "astro";
import { executeCircuit } from "@/lib/execute";
import type { RunRequest } from "@/lib/runner";

const CF_ACCOUNT_ID_RE = /^[a-f0-9]{32}$/;

function makeRestRunner(accountId: string, apiToken: string) {
  return {
    async run(model: string, input: unknown): Promise<unknown> {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      );
      const data = (await res.json()) as { result: unknown; success: boolean; errors: unknown[] };
      if (!res.ok || !data.success) {
        throw new Error(`CF AI error ${res.status}: ${JSON.stringify(data.errors)}`);
      }
      return data.result;
    },
  };
}

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

  let aiRunner: { run: (m: string, i: unknown) => Promise<unknown> };
  if (body.cfCreds?.accountId && body.cfCreds?.apiToken) {
    const { accountId, apiToken } = body.cfCreds;
    if (!CF_ACCOUNT_ID_RE.test(accountId)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid Cloudflare account ID format (expected 32 hex chars)." }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }
    aiRunner = makeRestRunner(accountId, apiToken);
  } else if (env?.AI) {
    aiRunner = env.AI as unknown as { run: (m: string, i: unknown) => Promise<unknown> };
  } else {
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
          aiRunner,
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
