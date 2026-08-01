/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
export { MultiplayerRoom } from "./multiplayer-room";

type DurableObjectId = object;

interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  CO_OP_ROOMS?: DurableObjectNamespace;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const coOpRoom = url.pathname.match(/^\/api\/co-op\/rooms\/([A-Za-z0-9]{6})$/);
    if (coOpRoom) {
      if (request.method !== "GET") {
        return new Response("Co-op rooms accept GET WebSocket upgrades only.", { status: 405 });
      }
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Upgrade Required", { status: 426, headers: { Upgrade: "websocket" } });
      }
      if (!env.CO_OP_ROOMS) {
        return new Response("Co-op multiplayer is not configured on this deployment.", {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        });
      }
      const roomCode = coOpRoom[1].toUpperCase();
      const headers = new Headers(request.headers);
      headers.set("X-Co-Op-Room-Code", roomCode);
      const durableObject = env.CO_OP_ROOMS.get(env.CO_OP_ROOMS.idFromName(roomCode));
      return durableObject.fetch(new Request(request, { headers }));
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
