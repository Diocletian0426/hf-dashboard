# HF Dashboard

The office web dashboard for HF Bored Piles — projects, piles, tests, issues,
machines, manpower, attendance and claims, all read from the Supabase
"Bored Pilling System" database.

## Stack (deliberately boring)

- **Plain HTML + CSS + JS. No frameworks, no build step, no CDN.**
  supabase-js is vendored at `frontend/vendor/supabase.js`.
- **All data goes through `window.Dash`** (`frontend/dashboard-client.js`) —
  pages never call `supabase.from()/rpc()` directly. The header comment in
  that file is the full API contract.
- The database is the real guard: tables are locked, access is via granted
  `v_*` views and `SECURITY DEFINER` functions. Buttons in the UI are
  convenience only — the DB re-checks the caller's designation on every write.
- Schema lives in the separate **hf-database** repo (numbered migrations).
  Never change the database from this repo.

## Run it locally

```
python tools/serve.py        # no-cache server on http://localhost:8123
node tools/check-js.js       # syntax-check all JS + inline scripts — run before EVERY commit
```

Open http://localhost:8123/login.html and sign in with an office account
(accounts are created by the office — no self-registration).

## Hosting (GitHub Pages)

Every push to `main` auto-publishes the `frontend/` folder via
`.github/workflows/pages.yml`, so `frontend/` IS the site root — the office
opens **https://diocletian0426.github.io/hf-dashboard/** and lands on the app
(signed-out visitors are redirected to login). Repo Settings → Pages → Source
must stay **"GitHub Actions"**.

The published site is viewable by anyone with the URL — fine by design: the
pages hold no data, `config.js` carries only the *publishable* key, and all
data access still requires an office sign-in (the database is the guard).
Note the repo itself is public (free-plan requirement for Pages).

## Page map

| Page | What it is |
|---|---|
| `login.html` | Sign-in card (no nav) |
| `index.html` | Overview — per-project pulse cards + needs-attention row |
| `projects.html` | Project directory / progress |
| `project.html` | Single-project hub (KPIs, zones, trend, attention, claims mirror) |
| `piles.html` | Pile register for one project (zones, record cards, testing) |
| `claims.html` | Working money page (management/office only; BQ entry is SQL-only by decision) |
| `issues.html` | Site issue work queue |
| `machines.html` | Machine fleet + servicing + moves |
| `manpower.html` | Site manpower roster + moves |
| `attendance.html` | Punch attendance — **owned by the attendance collaborator, do not edit** (see `docs/ATTENDANCE-HANDOFF.md`) |
| `tests.html` | Cross-project test chasing queue (deliberately thin — locked decision) |

## Shared architecture

Every content page has the same skeleton and load order:

```html
<header id="nav"></header>   <!-- shell.js injects the nav bar here -->
<main id="main">…</main>     <!-- replaced with a notice if access is denied -->

<script src="vendor/supabase.js"></script>
<script src="config.js"></script>            <!-- Supabase URL + publishable key -->
<script src="dashboard-client.js"></script>  <!-- window.Dash: the only data layer -->
<script src="ui.js"></script>                <!-- window.UI: shared helpers + labels -->
<!-- claims-ui.js only on project.html + claims.html -->
<script src="shell.js"></script>             <!-- login guard, nav, PAGE_ACCESS tiers -->
<script> window.onShellReady = function (profile) { …page code… } </script>
```

- `frontend/styles.css` — the **single stylesheet** (design tokens at the top).
- `frontend/ui.js` — `window.UI`: escaping, date/RM formatting, the
  plain-language label map (raw DB values never reach the screen), state
  helpers, open-card/scroll persistence, pile-stage + test-bucket constants.
- `frontend/shell.js` — login guard + nav. Does **not** depend on ui.js
  (attendance.html loads shell without it).
- Times are Malaysia time everywhere — use `Dash.todayKL()` / `Dash.klTime()`,
  never `new Date().toISOString()`.
- Every fetch failure must show a red banner — never a silent empty page.

## Delivery workflow

Branch → PR → review → merge. No direct pushes to `main`. Run
`node tools/check-js.js` before every commit. Database changes happen only in
the hf-database repo and are applied to live only by the owner.

More detail: `docs/ATTENDANCE-HANDOFF.md` (rules + attendance ownership),
`docs/LEAVE-UI.md` (the deferred leave page spec).
