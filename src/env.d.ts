/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

type Runtime = import("@astrojs/cloudflare").Runtime<{
  AI: Ai;
  ASSETS: Fetcher;
}>;

declare namespace App {
  interface Locals extends Runtime {}
}
