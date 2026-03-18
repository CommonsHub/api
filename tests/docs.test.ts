import { describe, it, expect } from "bun:test";
import { app } from "../src/index";

const req = (path: string) => app.request(path);

describe("root redirect", () => {
  it("GET / redirects to /v1/docs", async () => {
    const res = await req("/");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/v1/docs");
  });
});

describe("GET /v1/docs", () => {
  it("returns HTML index of doc files", async () => {
    const res = await req("/v1/docs");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("CommonsHub API Docs");
    expect(body).toContain('href="/v1/docs/index"');
    expect(body).toContain('href="/v1/docs/specs"');
    expect(body).toContain('href="/v1/docs/nostr"');
  });
});

describe("GET /v1/docs/:name (rendered HTML)", () => {
  it("renders markdown as HTML", async () => {
    const res = await req("/v1/docs/index");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    // Should contain rendered HTML, not raw markdown
    expect(body).toContain("<h1>");
    expect(body).toContain("Commons Hub API Reference");
    // Should not contain raw markdown syntax
    expect(body).not.toMatch(/^# /m);
  });

  it("returns 404 for non-existent doc", async () => {
    const res = await req("/v1/docs/nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("GET /v1/docs/:name.md (raw markdown)", () => {
  it("serves raw markdown with correct content-type", async () => {
    const res = await req("/v1/docs/index.md");
    expect(res.status).toBe(200);
    const ct = res.headers.get("content-type")!;
    expect(ct).toContain("text/markdown");
    expect(ct).toContain("charset=utf-8");
    const body = await res.text();
    // Should be raw markdown
    expect(body).toMatch(/^# /m);
  });

  it("returns 404 for non-existent .md file", async () => {
    const res = await req("/v1/docs/nonexistent.md");
    expect(res.status).toBe(404);
  });
});

describe("path traversal protection", () => {
  it("rejects traversal in rendered route", async () => {
    const res = await req("/v1/docs/..%2F..%2Fetc%2Fpasswd");
    expect([403, 404]).toContain(res.status);
  });

  it("rejects traversal in raw route", async () => {
    const res = await req("/v1/docs/..%2F..%2Fetc%2Fpasswd.md");
    expect([403, 404]).toContain(res.status);
  });
});
