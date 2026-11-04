// File-based store for running on your own computer without a database. Data goes in ./.data
// Not for Render: Render's free disk is wiped on every restart. Use DATABASE_URL there.
import { readFile, writeFile, mkdir, rm, readdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";

export function createFileStore(DATA) {
  const enc = (k) => k.split("/").map(encodeURIComponent).join("/") + ".json";
  return {
    kind: "file",
    async get(key) { const f = join(DATA, enc(key)); if (!existsSync(f)) return null; return JSON.parse(await readFile(f, "utf8")); },
    async setJSON(key, v) { const f = join(DATA, enc(key)); await mkdir(dirname(f), { recursive: true }); const tmp = f + ".tmp"; await writeFile(tmp, JSON.stringify(v)); await rename(tmp, f); },
    async delete(key) { await rm(join(DATA, enc(key)), { force: true }); },
    async list({ prefix }) {
      const dir = join(DATA, prefix.split("/").filter(Boolean).map(encodeURIComponent).join("/"));
      if (!existsSync(dir)) return { blobs: [] };
      return { blobs: (await readdir(dir)).filter((f) => f.endsWith(".json")).map((f) => ({ key: prefix + decodeURIComponent(f.slice(0, -5)) })) };
    },
    async ping() {},
    async close() {},
  };
}
