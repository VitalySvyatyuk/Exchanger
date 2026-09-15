import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { fetchJson } from "./http";

const schema = z.object({ ok: z.literal(true) });

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("fetchJson", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Remove jitter so backoff delays are exact.
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the validated body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ok: true })));
    await expect(fetchJson("https://api.test", { schema })).resolves.toEqual({
      ok: true,
    });
  });

  it("waits for Retry-After on 429, then retries", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({}, 429, { "retry-after": "2" }))
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal("fetch", fetch);

    const result = fetchJson("https://api.test", { schema });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("caps a long Retry-After at 5 seconds", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({}, 503, { "retry-after": "3600" }))
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal("fetch", fetch);

    const result = fetchJson("https://api.test", { schema });
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(result).resolves.toEqual({ ok: true });
  });

  it("backs off exponentially and gives up after the retries", async () => {
    const fetch = vi.fn().mockImplementation(async () => json({}, 500));
    vi.stubGlobal("fetch", fetch);

    const result = fetchJson("https://api.test", { schema, retries: 2 });
    const assertion = expect(result).rejects.toThrow(
      "https://api.test responded with 500",
    );
    await vi.advanceTimersByTimeAsync(250); // first retry
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(500); // second retry
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("retries network errors", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal("fetch", fetch);

    const result = fetchJson("https://api.test", { schema });
    await vi.advanceTimersByTimeAsync(250);
    await expect(result).resolves.toEqual({ ok: true });
  });

  it.each([
    ["a client error", () => json({}, 404), "responded with 404"],
    [
      "an unexpected body",
      () => json({ unexpected: true }),
      "Unexpected response",
    ],
  ])("doesn't retry %s", async (_, response, message) => {
    const fetch = vi.fn().mockImplementation(async () => response());
    vi.stubGlobal("fetch", fetch);

    await expect(fetchJson("https://api.test", { schema })).rejects.toThrow(
      message,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
