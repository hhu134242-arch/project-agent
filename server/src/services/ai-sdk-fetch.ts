import { guardedRemoteHttpFetch } from "./remote-http-fetch.js";

/** Server-owned transport; it is never read from agent configuration JSON. */
export function createAiSdkEndpointFetch(options: { timeoutSec?: number } = {}): typeof fetch {
  const budgetMs = Math.max(1, Math.min(options.timeoutSec ?? 300, 3600)) * 1000;
  return async (input, init) => {
    if (input instanceof Request) throw new TypeError("API model transport requires a URL and explicit request options");
    const endpoint = new URL(input);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      throw new Error("API models require a public HTTPS endpoint without URL credentials");
    }
    const controller = new AbortController();
    const signals = [controller.signal, AbortSignal.timeout(budgetMs), ...(init?.signal ? [init.signal] : [])];
    const response = await guardedRemoteHttpFetch(endpoint, { ...init, signal: AbortSignal.any(signals), redirect: "error" }, {
      allowPrivateNetwork: false,
      connectTimeoutMs: 10_000,
      dnsTimeoutMs: 5_000,
      responseTimeoutMs: budgetMs,
      error: (_message, code) => new Error(`API model endpoint unavailable (${code})`),
    });
    if (response.status >= 300 && response.status < 400) {
      controller.abort();
      await response.body?.cancel();
      throw new Error("API model redirects are unsupported; configure the final HTTPS endpoint");
    }
    if (!response.body) return response;
    let bytes = 0;
    const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, stream) {
        bytes += chunk.byteLength;
        if (bytes > 32 * 1024 * 1024) {
          controller.abort();
          stream.error(new Error("API model response exceeds the size limit"));
        } else stream.enqueue(chunk);
      },
    }));
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}
