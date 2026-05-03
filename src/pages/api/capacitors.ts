import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

export const prerender = false;

export const GET: APIRoute = async () => {
  const entries = await getCollection("capacitors");
  const out = entries.map((e: { data: { slug: string; title: string }; body?: string }) => ({
    slug: e.data.slug,
    title: e.data.title,
    body: e.body ?? "",
  }));
  return new Response(JSON.stringify(out), {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
  });
};
