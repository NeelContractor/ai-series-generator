import createClient from "openapi-fetch";

import type { components, paths } from "./schema";

export type { components, paths };

export type JobAccepted = components["schemas"]["JobAccepted"];
export type JobRead = components["schemas"]["JobRead"];
export type RenderStatusRead = components["schemas"]["RenderStatusRead"];

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(baseUrl: string) {
  return createClient<paths>({ baseUrl });
}

export async function waitForJob(
  client: ApiClient,
  jobId: string,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<JobRead> {
  const {
    intervalMs = 1000,
    timeoutMs = 10 * 60 * 1000,
    signal,
  } = options;
  const startedAt = Date.now();

  while (true) {
    const { data, error, response } = await client.GET("/jobs/{job_id}", {
      params: { path: { job_id: jobId } },
      signal,
    });
    if (error || !data) {
      throw new Error(
        `Failed to poll job ${jobId}: ${response.status} ${response.statusText}`,
      );
    }
    if (data.status === "succeeded" || data.status === "failed") {
      return data;
    }
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`Job ${jobId} did not finish within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export type RenderEventHandlers = {
  onProgress?: (status: RenderStatusRead) => void;
  onDone?: (status: RenderStatusRead) => void;
  onError?: (event: Event) => void;
};

export function subscribeToRenderEvents(
  seriesId: string,
  handlers: RenderEventHandlers,
  options: {
    baseUrl: string;
    eventSource?: typeof EventSource;
  },
): () => void {
  const EventSourceImpl = options.eventSource ?? globalThis.EventSource;
  if (!EventSourceImpl) {
    throw new Error("EventSource is not available in this environment");
  }

  const source = new EventSourceImpl(
    `${options.baseUrl.replace(/\/$/, "")}/series/${seriesId}/events`,
  );

  source.addEventListener("progress", (event) => {
    const message = event as MessageEvent<string>;
    handlers.onProgress?.(
      JSON.parse(message.data) as RenderStatusRead,
    );
  });
  source.addEventListener("done", (event) => {
    const message = event as MessageEvent<string>;
    handlers.onDone?.(JSON.parse(message.data) as RenderStatusRead);
    source.close();
  });
  source.onerror = (event) => {
    handlers.onError?.(event);
  };

  return () => source.close();
}
