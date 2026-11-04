# AK CAREER

```
frontend/   → Netlify   (the website: mission page + portal, plain HTML/CSS/JS)
backend/    → Render    (the API: Node server, JWT login, saves your data)
database    → Supabase  (Postgres: where your data lives permanently)
```

The site on Netlify talks to the API on Render, and the API stores everything in Supabase. All three have free plans.

---

## Step 1 · Database on Supabase (about 3 minutes)

1. supabase.com → **New project**. Pick region **Mumbai (ap-south-1)** and save the database password somewhere safe.
2. Once the project is ready, click **Connect** at the top.
3. Choose **Session pooler** and copy the string. It looks like:
   ```
   postgresql://postgres.abcd1234:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
   ```
4. Replace `[YOUR-PASSWORD]` with your password. This whole string is your `DATABASE_URL`.

Use the **Session pooler**, not the "Direct connection". The direct connection only works over IPv6, and Render can't reach it.

You don't need to create any tables. The API creates its own table on first start, in a private `hub` schema with row-level security on, so nothing is exposed through Supabase's public API. `backend/server/schema.sql` has the SQL if you'd rather run it yourself in the SQL editor.

## Step 2 · Put the code on GitHub

```bash
cd ak-career
git init && git add . && git commit -m "AK CAREER"
git branch -M main
git remote add origin https://github.com/<your-username>/ak-career.git
git push -u origin main
```

## Step 3 · Backend on Render

1. render.com → **New → Blueprint** → choose your repo → **Apply**. It reads `render.yaml`, which points at the `backend/` folder.
2. Render asks for three values:
   - **DATABASE_URL**: the Supabase string from step 1.
   - **SIGNUP_CODE**: a phrase only you know. Nobody can create an account without it.
   - **ALLOWED_ORIGINS**: your Netlify address from step 4, e.g. `https://ak-career.netlify.app`. If you don't have it yet, put `*` now and change it after step 4.
   
   `JWT_SECRET` is generated automatically.
3. Wait for **Live**, then open `https://ak-career-api.onrender.com/healthz`. It should say `ok`. Your exact address is shown at the top of the Render page.

<details><summary>Without the Blueprint (manual Web Service)</summary>

- **Root directory:** `backend`
- **Build command:** `npm install --omit=dev`
- **Start command:** `node server/index.mjs`
- **Health check path:** `/healthz`
- **Environment variables:**
  - `NODE_ENV=production`
  - `JWT_SECRET`: generate with `openssl rand -hex 32`
  - `DATABASE_URL`
  - `SIGNUP_CODE`
  - `ALLOWED_ORIGINS`
</details>

## Step 4 · Frontend on Netlify

**Quickest:**
1. Open `frontend/config.js` and put your Render address in:
   ```js
   window.HUB_CONFIG = { API_BASE: "https://ak-career-api.onrender.com" };
   ```
2. Drag the **`frontend`** folder onto https://app.netlify.com/drop.

You can also leave `config.js` empty and paste the Render address on the login screen under **Server settings**. It's then remembered in that browser, so you'd do it once per device.

**From GitHub** (auto-deploys on every push): Netlify → **Add new site → Import from Git** → your repo → set **Base directory** to `frontend` → Deploy.

Then go back to Render → **Environment** and set `ALLOWED_ORIGINS` to your Netlify address, e.g. `https://ak-career.netlify.app`.

## Step 5 · First login

Open your Netlify site → **Enter the portal** → **Create account**, and enter your sign-up code. Done.

To test the live backend from your computer (Node 18+ required):
```bash
cd backend
ORIGIN=https://ak-career.netlify.app SIGNUP_CODE=your-phrase node dev/http-test.mjs https://ak-career-api.onrender.com
```
It runs 16 checks: database, sign-up, tokens, CORS, saving, conflict protection, CSRF, snapshots and login. It creates a throwaway `test-…@example.com` account.

---

## Good to know

- **Sleep:** Render's free plan sleeps after 15 minutes without visits, and the next visit takes about a minute to wake it. The portal shows "Waking the server up…" and waits. Render's Starter plan ($7/month) stays awake.
- **Your data never resets:**
  - Every change saves to Supabase within about a second.
  - If two devices save at the same time, the server rejects the older save and the app merges the two, instead of overwriting.
  - The server keeps one snapshot per day, which you can restore from Settings.
  - If you're offline, changes wait in the browser and upload when you're back.
- **Login:** the frontend on Netlify logs in with a JWT Bearer token (30 days), stored in the browser.
  - Passwords are hashed with scrypt.
  - 8 wrong passwords lock the email out for 15 minutes.
  - The API only accepts browser requests from `ALLOWED_ORIGINS`.
- **Secrets** (`DATABASE_URL`, `JWT_SECRET`, `SIGNUP_CODE`) live only in Render's dashboard, never in Git.

## Run everything on your computer

```bash
cd backend && npm install && npm start        # API on http://localhost:8888 (saves to backend/.data without DATABASE_URL)
cd frontend && python3 -m http.server 5500     # site on http://localhost:5500
```

Then open http://localhost:5500/app.html, open **Server settings**, and enter `http://localhost:8888`.

## API reference

All bodies are JSON. Send `Authorization: Bearer <token>`. You get the token from register or login.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/healthz` | | `ok` when the database is reachable |
| GET | `/api/health` | | `{ok, configured}` |
| POST | `/api/auth/register` | `{name, email, password, code}` | `{user, token}` |
| POST | `/api/auth/login` | `{email, password}` | `{user, token}` |
| POST | `/api/auth/logout` | `{}` | `{ok}` |
| GET | `/api/me` | | `{user}` |
| POST | `/api/auth/password` | `{current, next}` | `{ok}` |
| GET | `/api/state` | | `{version, updatedAt, data}` |
| PUT | `/api/state` | `{version, data}` | `{version}`, or `409 {current}` if another device saved first |
| GET | `/api/snapshots` | | `{snapshots: ["2026-11-03", …]}` |
| POST | `/api/snapshots/restore` | `{date}` | the restored state |

## Change the plan

Edit `frontend/data.js` for weeks, periods, timetable, A2Z problems, reading topics and milestones, then redeploy the frontend. Semester 4 subjects and syllabus are added inside the portal.
