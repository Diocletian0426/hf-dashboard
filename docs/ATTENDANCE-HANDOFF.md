# Attendance — handoff brief (frontend + backend)

*For the developer taking over the ATTENDANCE feature and their AI assistant. Read this first,
top to bottom. It tells you exactly which repos and database to use, what already exists, the
hard rules, and how to deliver changes. When this doc and the code disagree, the code and the
SQL migrations win — then tell us so we fix this doc.*

---

## 1. Your mission and its boundary

You own the **attendance domain end-to-end**:

- **Frontend:** `frontend/attendance.html` in this repo (`hf-dashboard`), plus any attendance-
  specific engine functions in `frontend/dashboard-client.js` (see §5 rules).
- **Backend (read layer):** the attendance report views/functions in the `hf-database` repo —
  today that is `v_worker_daily_shifts`, `v_worker_punches`, `get_daily_shifts`,
  `get_recent_punches`, `get_sites_missing_geofence`. You may extend these and add new
  attendance views/RPCs via migration files (see §7 for how they get applied).

**Explicitly NOT yours to change without proposing first:**

- The punch **write path** (`record_punch`, `bind_device`, `release_device`, `get_my_status`,
  the `worker_devices` / `worker_punch_records` table structures). These are shared with the
  live worker punch app (`hf-punch-system`) — a change there can break punching at the sites.
  Propose changes; don't ship them.
- The dashboard **auth/shell layer** (`shell.js`, `login.html`, `config.js`) and other pages.
- Anything in the database that isn't attendance (projects, piles, machines, leave, issues).

## 2. The repos

| Repo | URL | Role |
|---|---|---|
| `hf-dashboard` | github.com/Diocletian0426/hf-dashboard (private) | the office dashboard — your frontend lives here |
| `hf-database` | github.com/Diocletian0426/hf-database (private) | **single source of truth for the database schema** — every schema change is a numbered `.sql` migration here; your backend changes live here |
| `hf-punch-system` | github.com/Diocletian0426/hf-punch-system (private) | the workers' punch app (context + the write side you must not break). Read `docs/HOW-IT-WORKS.md` there — the full plain-language guide to the punch system |

## 3. The database

- Supabase project **"Bored Pilling System"**, ref `fwuftjunybbxlhwauxta`
  (`https://fwuftjunybbxlhwauxta.supabase.co`).
- **Access model — "locked room, guarded windows":** tables are locked (Row Level Security with
  no public policy); all app access goes through views and `SECURITY DEFINER` functions.
  - Worker punch app calls its functions with the **anon (publishable) key** + a device token.
  - The dashboard signs in with **Supabase Auth email+password** and reads as the
    `authenticated` role. Attendance views/RPCs are granted to `authenticated` (never anon).
- **Keys:** the anon key in `frontend/config.js` is public **by design** — safe to commit.
  The **service_role key must NEVER appear in any frontend code, commit, or chat log.** You
  don't need it; if you think you do, your design is wrong — ask first.
- A public-read lockdown migration is pending (reserved as `0021`): soon the anon role will
  read **nothing**. Never build anything that reads tables directly with the anon key.

## 4. What already exists (don't rebuild it)

### Backend (all live, all granted to `authenticated`)

| Function | Signature | Returns |
|---|---|---|
| `get_daily_shifts` | `(p_work_date date, p_project_id uuid)` | per worker/day: `full_name, project_name, work_date, first_in_at, last_out_at, in_count, out_count, hours_on_site, has_anomaly, overlong_shift` |
| `get_recent_punches` | `(p_project_id uuid, p_work_date date, p_limit int)` | raw punches: `punched_at, full_name, punch_type, project_name, gps_*, distance_m, verification_status` |
| `get_sites_missing_geofence` | `()` | active sites with workers but no GPS fence set |

⚠️ `get_daily_shifts(p_work_date := null)` returns **every date ever** — always pass an explicit date.

Underlying data: `worker_punch_records` (one row per punch; server-stamped time;
`verification_status` ∈ verified / outside_geofence / low_accuracy / no_gps / no_geofence /
no_site), one punch-IN + one punch-OUT per worker per Malaysia day, punch-out files under the
punch-in's work-day (night shifts), inactive staff are locked out at the token check.
Full behaviour narrative: `hf-punch-system/docs/HOW-IT-WORKS.md`. Full function API:
`hf-database/README.md`.

### Frontend

- `frontend/attendance.html` — current page: date + site filters, shifts table with
  anomaly/overlong badges, amber geofence banner, "show raw punches" toggle.
- Engine commands already exposed on `window.Dash` (see the header comment of
  `dashboard-client.js` for the full list): `getShifts(date, projectId?)`,
  `getRecentPunches(date, projectId?, limit?)`, `getSitesMissingGeofence()`,
  `getProjectPulse()` (site dropdown), `todayKL()`, `klTime()`, `klDateTime()`.
- Shared shell: every page has `<header id="nav"></header><main id="main">…</main>`, loads
  `vendor/supabase.js` + `config.js` + `dashboard-client.js` + `shell.js`, and implements
  `window.onShellReady = async function (profile) { … }`. The shell handles login-guard, nav,
  and page tiers — your page code never touches auth.

### Data reality (as of 2026-07-06)

- The punch **pilot has not started**: real punches don't exist yet. Test data = 3 punches by
  the "Avengers" test crew on 2026-06-28 (project TEST-AVENGERS). Build against that; design
  for hundreds of workers later.
- Only 1 site has a GPS geofence; 13 active sites are missing one (the banner is correct).

## 5. Hard rules (the bot should treat these as law)

**Frontend**
1. Plain HTML + CSS + JS only. No frameworks, no build step, no npm dependencies, no CDN
   scripts (everything ships in the repo; supabase-js is vendored at `frontend/vendor/`).
2. All data access goes through `window.Dash` engine commands. Pages never call
   `supabase.from/rpc` directly — if you need a new query, add a `Dash.*` function with a
   one-line doc in the engine's header comment, keeping to its existing style.
3. Timezone is **Asia/Kuala_Lumpur** everywhere. Use `Dash.todayKL()` — never
   `new Date().toISOString()` (UTC skew breaks evenings).
4. Every fetch failure renders a visible red `.banner-red` box with the error message —
   never a silent empty page.
5. Wording: daily-report figures are **provisional** ("latest reported"), bore-log figures are
   "verified". Punch times are server-stamped and authoritative.

**Backend**
6. Schema changes = a new numbered file in `hf-database/supabase/migrations/`
   (`0025_...` is next; `0021` is reserved — check the folder for the latest before numbering).
   Additive only; **never edit an existing migration**; never apply `0000_baseline.sql`
   anywhere (it documents history — everything in it already exists live).
7. New views: immediately `revoke all ... from anon, authenticated;` then
   `grant select ... to authenticated;` (Supabase default-grants every new view to the public
   roles — this is the standing gotcha). New functions: `security definer`,
   `set search_path = public, pg_temp`, explicit revoke/grant, `authenticated` only.
8. Read-only SQL exploring the live DB is fine. **Applying migrations to the live database is
   not your step** — see §7.

**Process**
9. Run `node tools/check-js.js` (repo root) before every commit — it syntax-checks all JS
   including scripts inside the HTML pages.
10. Commit messages: plain imperative summaries. **No AI co-author trailers.**
11. Don't touch files outside the attendance boundary (§1). If a shared file must change
    (styles.css additions are usually fine; engine additions per rule 2), keep the diff
    minimal — add at the end of the file in a clearly-commented block, never reformat
    existing lines.
12. **Test data discipline:** test writes go ONLY against the `TEST-AVENGERS` project and its
    Avengers test staff — never real projects or real workers. Real-project rows flow into
    management reports and eventually payment claims. Clean up your test rows when done.

## 6. Run & test locally

```
python tools/serve.py        # serves frontend/ at http://localhost:8123 with no-cache headers
```
Open `http://localhost:8123/login.html`, sign in with the office test account (ask for
credentials — do not create accounts; signups are disabled). Attendance test data: set the
date picker to **2026-06-28**.

## 7. Delivery workflow

1. **Pull/rebase onto the latest `main` before starting any work** — the owner side also
   commits to these repos, so your clone goes stale. Then work on a **branch**, push, open a
   **PR** — one PR per coherent change.
2. Frontend-only PRs: reviewed and merged, done.
3. PRs containing migrations: the migration file is reviewed first, then **applied to live by
   the owner side** (via the Supabase management tooling), then merged. Never run DDL against
   the live project yourself. **The number on your migration file is provisional** — two
   people number files in parallel, so the owner assigns the final number at apply time;
   don't be surprised if it shifts.
4. Anything that touches the "not yours" list in §1: open an issue / message first, code later.
5. **This flow is symmetric** (agreed 2026-07-06): the owner side also works branch → PR —
   nobody commits to `main` directly, on any of the three repos. It's a convention, not
   GitHub-enforced (private repos on a free plan), so it relies on everyone honouring it.

## 8. Reading list (in order)

1. `hf-punch-system/docs/HOW-IT-WORKS.md` — how punching works, end to end, plain language.
2. `hf-database/README.md` — the function API contract + how migrations work.
3. `frontend/dashboard-client.js` header comment — every engine command.
4. `hf-database/supabase/migrations/0001,0007,0010,0015,0016` — the punch backend's actual
   behaviour (shift-aware punch-out, retry-before-record, overlong-shift flag, inactive lockout).

## 9. Access checklist (owner arranges — ask if anything is missing)

- [ ] GitHub collaborator invites: `hf-dashboard`, `hf-database`, (`hf-punch-system` if not already)
- [ ] A Supabase Auth login for the dashboard (created by owner, Auto Confirm; optionally
      linked to a staff row — unlinked accounts see everything except Leave)
- [ ] This doc + the reading list
