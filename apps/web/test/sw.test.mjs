// Verifies the service worker's privacy rules by running public/sw.js in a simulated worker.
// Run: node --test apps/web/test/sw.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SCOPE = "https://user.github.io/angioedema-tracker/";
const API = "https://angioedema-api.example.workers.dev";
const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

function makeCaches() {
  const stores = new Map();
  const keyOf = (r) => (typeof r === "string" ? r : r.url);
  const open = async (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      put: async (req, res) => void m.set(keyOf(req), res),
      match: async (req) => m.get(keyOf(req)),
      addAll: async (urls) => urls.forEach((u) => m.set(u, new Response("shell"))),
    };
  };
  return {
    stores,
    open,
    keys: async () => [...stores.keys()],
    delete: async (n) => stores.delete(n),
    match: async (req) => {
      for (const m of stores.values()) if (m.has(keyOf(req))) return m.get(keyOf(req));
    },
  };
}

function boot({ online = true } = {}) {
  const handlers = {};
  const caches = makeCaches();
  const fetched = [];
  const self = {
    registration: { scope: SCOPE },
    location: new URL(SCOPE),
    addEventListener: (t, fn) => (handlers[t] = fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const fetchImpl = async (req) => {
    fetched.push(req.url);
    if (!online) throw new TypeError("offline");
    return new Response("body", { status: 200 });
  };
  vm.runInNewContext(source, { self, caches, fetch: fetchImpl, URL, Response, Promise, Request });
  const dispatch = async (type, init) => {
    let responded;
    const waits = [];
    const event = { ...init, respondWith: (p) => (responded = Promise.resolve(p)), waitUntil: (p) => waits.push(p) };
    handlers[type](event);
    await Promise.all(waits);
    return { intercepted: responded !== undefined, response: responded ? await responded : undefined };
  };
  const request = (url, opts = {}) => {
    // The Request constructor rejects mode "navigate", so set it on the instance afterwards.
    const { mode, ...rest } = opts;
    const r = new Request(url, rest);
    if (mode === "navigate") Object.defineProperty(r, "mode", { value: "navigate" });
    return r;
  };
  return { caches, fetched, dispatch, request };
}

const settle = () => new Promise((r) => setTimeout(r, 10));

test("never touches the API: cross-origin requests are not intercepted or cached", async () => {
  const sw = boot();
  for (const path of ["/api/episodes", "/api/episodes/6f1c1d2e-8a3b-4c5d-9e0f-123456789abc", "/api/export/csv", "/api/dashboard/summary"]) {
    const r = await sw.dispatch("fetch", { request: sw.request(API + path) });
    assert.equal(r.intercepted, false, path);
  }
  await settle();
  assert.equal([...sw.caches.stores.values()].reduce((n, m) => n + m.size, 0), 0);
});

test("ignores requests that carry an Authorization header, even same-origin", async () => {
  const sw = boot();
  const r = await sw.dispatch("fetch", {
    request: sw.request(SCOPE + "_next/static/x.js", { headers: { Authorization: "Bearer secret" } }),
  });
  assert.equal(r.intercepted, false);
});

test("ignores non-GET requests", async () => {
  const sw = boot();
  const r = await sw.dispatch("fetch", { request: sw.request(SCOPE + "x.png", { method: "POST", body: "x" }) });
  assert.equal(r.intercepted, false);
});

test("ignores same-origin URLs outside the app scope", async () => {
  const sw = boot();
  const r = await sw.dispatch("fetch", { request: sw.request("https://user.github.io/other-site/page.png") });
  assert.equal(r.intercepted, false);
});

test("page navigations are cached WITHOUT their query string (no episode ids stored)", async () => {
  const sw = boot();
  const id = "6f1c1d2e-8a3b-4c5d-9e0f-123456789abc";
  const r = await sw.dispatch("fetch", { request: sw.request(`${SCOPE}episode/?id=${id}&saved=1`, { mode: "navigate" }) });
  assert.equal(r.intercepted, true);
  await settle();
  const keys = [...sw.caches.stores.values()].flatMap((m) => [...m.keys()]);
  assert.ok(keys.includes(`${SCOPE}episode/`), keys.join());
  assert.ok(!keys.some((k) => k.includes(id) || k.includes("?")), "a cache key contains a query string or id");
});

test("static assets are cached; RSC/data payloads are not", async () => {
  const sw = boot();
  const asset = await sw.dispatch("fetch", { request: sw.request(SCOPE + "_next/static/chunks/app.js") });
  assert.equal(asset.intercepted, true);
  const payload = await sw.dispatch("fetch", { request: sw.request(SCOPE + "episode/index.txt") });
  assert.equal(payload.intercepted, false);
  await settle();
  const keys = [...sw.caches.stores.values()].flatMap((m) => [...m.keys()]);
  assert.ok(keys.some((k) => k.endsWith("app.js")));
  assert.ok(!keys.some((k) => k.endsWith(".txt")));
});

test("offline: a previously visited page falls back to the cached shell", async () => {
  const online = boot();
  await online.dispatch("fetch", { request: online.request(SCOPE + "trends/", { mode: "navigate" }) });
  await settle();
  const offline = boot({ online: false });
  for (const [name, store] of online.caches.stores) (await offline.caches.open(name), offline.caches.stores.set(name, store));
  const r = await offline.dispatch("fetch", { request: offline.request(SCOPE + "trends/?x=1", { mode: "navigate" }) });
  assert.equal(r.response.status, 200);
});

test("offline with nothing cached fails cleanly instead of hanging", async () => {
  const sw = boot({ online: false });
  const r = await sw.dispatch("fetch", { request: sw.request(SCOPE + "settings/", { mode: "navigate" }) });
  assert.equal(r.response.type, "error");
});

test("install precaches only static shell files", async () => {
  const sw = boot();
  await sw.dispatch("install", {});
  const keys = [...sw.caches.stores.values()].flatMap((m) => [...m.keys()]);
  assert.deepEqual(keys.sort(), [SCOPE, SCOPE + "icons/icon-192.png", SCOPE + "manifest.webmanifest"].sort());
});

test("activate removes caches from older versions", async () => {
  const sw = boot();
  await sw.caches.open("pages-v0");
  await sw.caches.open("static-v1");
  await sw.dispatch("activate", {});
  const names = await sw.caches.keys();
  assert.ok(!names.includes("pages-v0"));
  assert.ok(names.includes("static-v1"));
});

test("the worker source contains no API host or credential handling", () => {
  assert.ok(!/workers\.dev|\/api\//.test(source.replace(/\/\*[\s\S]*?\*\//, "")), "sw.js mentions the API");
});
