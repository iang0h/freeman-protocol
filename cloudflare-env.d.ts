// Cloudflare injects the concrete D1 binding at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
  };
}
