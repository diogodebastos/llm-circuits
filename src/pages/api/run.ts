import type { APIRoute } from "astro";
import { executeCircuit } from "@/lib/execute";
import type { RunRequest } from "@/lib/runner";

const CF_ACCOUNT_ID_RE = /^[a-f0-9]{32}$/;

interface CallTelemetry {
  model: string;
  ms: number;
  cached?: boolean;
  neurons?: number;
  logId?: string;
}

function makeRestRunner(accountId: string, apiToken: string, gatewayId?: string, telemetry?: CallTelemetry[]) {
  return {
    async run(model: string, input: unknown): Promise<unknown> {
      const url = gatewayId
        ? `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/workers-ai/${model}`
        : `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
      const t0 = Date.now();
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const ms = Date.now() - t0;
      const cached = res.headers.get("cf-aig-cache-status") === "HIT";
      const logId = res.headers.get("cf-aig-log-id") ?? undefined;
      if (gatewayId) {
        // AI Gateway returns the model output directly.
        if (!res.ok) {
          throw new Error(`CF AI Gateway error ${res.status}: ${await res.text()}`);
        }
        const data = await res.json();
        telemetry?.push({ model, ms, cached, logId });
        return data;
      }
      const data = (await res.json()) as { result: unknown; success: boolean; errors: unknown[] };
      if (!res.ok || !data.success) {
        throw new Error(`CF AI error ${res.status}: ${JSON.stringify(data.errors)}`);
      }
      telemetry?.push({ model, ms });
      return data.result;
    },
  };
}

function wrapBindingRunner(ai: { run: (m: string, i: unknown, opts?: unknown) => Promise<unknown> }, gatewayId: string | undefined, telemetry: CallTelemetry[]) {
  return {
    async run(model: string, input: unknown): Promise<unknown> {
      const t0 = Date.now();
      const opts = gatewayId ? { gateway: { id: gatewayId, skipCache: false } } : undefined;
      const out = await ai.run(model, input, opts);
      telemetry.push({ model, ms: Date.now() - t0 });
      return out;
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

  const env = locals.runtime?.env as { AI?: Ai; AI_GATEWAY_ID?: string } | undefined;
  const gatewayId = env?.AI_GATEWAY_ID;
  const telemetry: CallTelemetry[] = [];

  let aiRunner: { run: (m: string, i: unknown) => Promise<unknown> };
  if (body.cfCreds?.accountId && body.cfCreds?.apiToken) {
    const { accountId, apiToken } = body.cfCreds;
    if (!CF_ACCOUNT_ID_RE.test(accountId)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid Cloudflare account ID format (expected 32 hex chars)." }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }
    aiRunner = makeRestRunner(accountId, apiToken, gatewayId, telemetry);
  } else if (env?.AI) {
    aiRunner = wrapBindingRunner(
      env.AI as unknown as { run: (m: string, i: unknown, opts?: unknown) => Promise<unknown> },
      gatewayId,
      telemetry
    );
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
        const totalMs = telemetry.reduce((a, t) => a + t.ms, 0);
        const cached = telemetry.filter((t) => t.cached).length;
        send({
          type: "done",
          result: {
            ...result,
            telemetry: { calls: telemetry.length, ms: totalMs, cached, gatewayUsed: !!gatewayId, perCall: telemetry },
          },
        });
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
