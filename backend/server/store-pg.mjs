// Postgres key-value store (Supabase or Render Postgres). One table, JSONB values.
// The table lives in its own schema `hub` with row-level security on, so Supabase's public REST API can't reach it.
import pg from "pg";

export async function createPgStore(connectionString) {
  const host = (() => { try { return new URL(connectionString).hostname; } catch { return ""; } })();
  const mode = (process.env.DATABASE_SSL || "").toLowerCase();
  // Render's internal hostnames (no dots) and localhost don't use TLS; managed hosts (Supabase, Render external) do.
  let ssl = !host.includes(".") || host === "127.0.0.1" || host === "localhost" ? false : { rejectUnauthorized: false };
  if (mode === "disable") ssl = false;
  if (mode === "verify" || process.env.DATABASE_CA) ssl = { rejectUnauthorized: true, ...(process.env.DATABASE_CA ? { ca: process.env.DATABASE_CA.replace(/\\n/g, "\n") } : {}) };

  const pool = new pg.Pool({ connectionString, ssl, max: +process.env.DATABASE_POOL || 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 15_000 });
  pool.on("error", (e) => console.error("postgres pool error:", e.message));

  await pool.query(`
    create schema if not exists hub;
    create table if not exists hub.kv (
      key        text primary key,
      value      jsonb not null,
      updated_at timestamptz not null default now()
    );
    alter table hub.kv enable row level security;
    revoke all on schema hub from public;
  `);

  const likeEscape = (s) => s.replace(/[\\%_]/g, (c) => "\\" + c);
  return {
    kind: "postgres",
    async get(key) { const r = await pool.query("select value from hub.kv where key = $1", [key]); return r.rows.length ? r.rows[0].value : null; },
    async setJSON(key, value) {
      await pool.query("insert into hub.kv (key, value, updated_at) values ($1, $2::jsonb, now()) on conflict (key) do update set value = excluded.value, updated_at = now()", [key, JSON.stringify(value)]);
    },
    async delete(key) { await pool.query("delete from hub.kv where key = $1", [key]); },
    async list({ prefix }) { const r = await pool.query("select key from hub.kv where key like $1 escape '\\' order by key", [likeEscape(prefix) + "%"]); return { blobs: r.rows.map((x) => ({ key: x.key })) }; },
    // write only if the stored version still matches (prevents two devices overwriting each other)
    async compareAndSet(key, value, expectedVersion) {
      const v = JSON.stringify(value);
      if (expectedVersion === 0) {
        const r = await pool.query("insert into hub.kv (key, value) values ($1, $2::jsonb) on conflict (key) do nothing returning key", [key, v]);
        if (r.rowCount) return true;
        const u = await pool.query("update hub.kv set value = $2::jsonb, updated_at = now() where key = $1 and coalesce((value->>'version')::int, 0) = 0 returning key", [key, v]);
        return u.rowCount === 1;
      }
      const r = await pool.query("update hub.kv set value = $2::jsonb, updated_at = now() where key = $1 and (value->>'version')::int = $3 returning key", [key, v, expectedVersion]);
      return r.rowCount === 1;
    },
    async ping() { await pool.query("select 1"); },
    async close() { await pool.end(); },
  };
}
