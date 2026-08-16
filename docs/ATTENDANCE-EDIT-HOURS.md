# Edit Hours — frontend contract (DB 0090 + 0091, live 2026-08-16)

The backend for office attendance corrections is **live**. This doc is the
contract for replacing the **Close Shift** button with **Edit Hours** on the
attendance page. Until that swap ships, nothing breaks: `close_shift` and
`reopen_shift` still work exactly as before.

## The model (owner-decided)

Worker punch rows are **never edited or deleted** — "else they would say we
are taking advantage." The office's ruling on a day's true hours lives in its
own layer on top (`attendance_corrections`, one row per person per day), the
same idiom as the bore-log agreed as-built figures. Wherever hours are shown,
**the correction wins, and both stay visible**: "Tapped 7:58 AM · Office set
8:30 AM — *reason*".

The 6 AM cron still auto-closes forgotten shifts at 17:00. Edit Hours is how
the office overrides the default with reality — it fully replaces Close Shift
and also covers the previously-impossible cases: **missing punch-in**, wrong
time at either end, and a whole missing day (both times required then).

## RPCs (both gated on `attendance.edit`, scoped to the day's project)

### `set_day_correction(p_staff_id uuid, p_work_date date, p_in_at timestamptz, p_out_at timestamptz, p_reason text)`

- Send **the full ruling each time** — a re-issue REPLACES the previous
  correction for that day (it is an upsert, not a merge). Prefill the form
  from the current correction if one exists.
- `p_in_at` / `p_out_at`: either or both; null means "keep the worker's raw
  time for that end". The *result* (correction laid over raw punches) must be
  a complete pair.
- `p_reason` is required and is **shown to the worker** in their app history.
- Error codes (all `{ok:false, code, message}` — messages are user-ready):
  `work_day_not_finished` (only past days), `reason_required`,
  `nothing_to_correct`, `missing_start` / `missing_end` (day lacks that raw
  punch, so the corrected time for it is mandatory), `out_before_in`,
  `too_long` (≥24 h), `out_in_future`, `wrong_day` (start not on that
  work-date, KL time), `unknown_staff`.
- Success: `{ok:true, full_name, work_date, hours, in_at_local, out_at_local}`.

### `clear_day_correction(p_staff_id uuid, p_work_date date)`

Removes the ruling; the raw punches stand again. `no_correction` if none.
Every set/clear is written to `audit_log` with old→new values.

## New columns on `get_daily_shifts` rows (all additive; old columns unchanged)

| Column | Meaning |
|---|---|
| `working_minutes` / `ot_minutes` | **(0091) THE official figures — bind sums and rows to these and DELETE the local `splitShift` function.** Computed server-side by `fn_shift_minutes` from the effective times with the exact same rule (08:30–17:00, lunch when in-window > 6 h, OT after 17:00, before 08:30 clipped, midnight crossing). `null` = day is open or broken (> 16 h span) — show "—", exclude from sums, exactly like today's overlong handling. The database is now the single authority for this rule; a rule change is a DB migration, not a frontend edit. |
| `has_correction` | an office ruling exists for this day |
| `effective_in_at` / `effective_out_at` | correction-first times — display only, no math needed |
| `effective_hours` | raw span of the effective pair (2 dp) |
| `corrected_in_at` / `corrected_out_at` | the ruling itself (null = that end not corrected) |
| `correction_reason`, `corrected_by_name`, `corrected_at` | show in the drawer |
| `needs_review` | `has_anomaly` and not yet corrected — good filter for the office worklist |

A day the office entered whole-cloth (no punches at all) appears as a normal
row with `in_count = 0` and null raw times.

## Suggested UI

- Day view: "Office Adjusted" badge when `has_correction`; hours from
  `effective_*`; drawer shows raw tap times struck-through or side-by-side
  with the ruling + reason + who/when.
- Replace **Close Shift** with **Edit Hours** (works for any past day, not
  just open shifts). Keep **Remove** (reopen_shift) as-is for deleting a bad
  auto-close row itself.
- After the swap ships, tell the owner — a cleanup migration (0091+) then
  retires `close_shift`. `office_closed` remains a valid status on historic
  rows.

## Also shipped in 0090 (no dashboard action needed)

- `record_punch` v6: a queued offline punch-out arriving after the 6 AM
  auto-close now **replaces** the machine's 17:00 guess with the worker's real
  tap (flagged `synced_late`, audited `late_sync_replaced_auto_close`).
  Human-made closures are never overridden; the lost tap is audit-logged as
  `late_punch_discarded`.
- `get_my_history` v3+v4 (punch app): each day now also carries `adjusted`,
  `official_in_local`, `official_out_local`, `closed_by_system`,
  `closed_by_office`, and (0091) `working_minutes` / `ot_minutes` — the
  server-official figures. The current app safely ignores them; the punch-app
  UI catch-up to *display* them (badges: "Adjusted by office — reason",
  "Closed automatically at 5:00 PM"; History tab showing the official hours)
  is a separate small task. The phone's local `splitMinutes` stays only as
  the live ticking preview while on shift — the server is the authority.
