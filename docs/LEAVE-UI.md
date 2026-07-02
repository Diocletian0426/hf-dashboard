# Leave — UI Handoff (screens to build)

The **backend is done and tested** (migrations `0011` + `0012` in the `hf-database` repo). This doc
lists the screens the frontend needs. Every screen just calls a database function via
`supabase.rpc('function_name', { …params })` and shows the result — it never touches tables directly.

**Leave spans both apps, by role:**
- **Punch app** (`hf-punch-system`, worker, **anon** key): the worker **submits** a request + sees their own balance.
- **Office dashboard** (`hf-dashboard`, office, **authenticated** key): the office **manages** entitlements and **approves / rejects**.

**The full loop:** worker submits on the punch app → request is `pending` → office approves on the
dashboard → balance updates. (Verified working end-to-end.)

---

## 🟦 Punch app screens (worker) — `hf-punch-system`

Use the **anon** client + the phone's saved `device_token` (the same token `record_punch` already uses).

### 1. "Request Leave" screen
- **Fields:** leave type (`annual` / `mc` / `unpaid` / `emergency`), start date, end date, number of days (the worker types it), reason (optional), photo of proof (optional).
- **On submit →** `request_leave(p_device_token, p_leave_type, p_start_date, p_end_date, p_days, p_reason?, p_attachment_url?)`
- **Returns** `{ ok, request_id, status:'pending' }`. Show a "submitted — waiting for office approval" confirmation.

### 2. "My Leave" screen
- **On open →** `get_my_leave_balance(p_device_token)`
- **Returns** `{ ok, full_name, year, total_entitled, annual_taken, remaining, requests[] }`.
- Show **remaining** days prominently; list `requests[]` (type, dates, days, and a status badge: pending / approved / rejected).

> Proof photo: upload the file first (Supabase Storage or a Drive link), get a URL, then pass it as
> `p_attachment_url`. It's **optional** — a worker can submit without proof.

---

## 🟩 Office dashboard screens — `hf-dashboard`

Use the **authenticated** (logged-in office) client, or a server-side call with the service-role key.

### 3. Leave balances
- **`get_leave_balance(p_staff_id?, p_year?)`** → one row per active worker: entitled / taken / **remaining**, plus `date_joined_missing` (flags who still needs a join date). Read-only table; add a year picker.

### 4. Leave requests + approvals
- **`get_leave_requests(p_staff_id?, p_status?, p_year?)`** → the list. Filter by status (default to `pending`).
- On a pending row: **Approve →** `approve_leave(request_id)`; **Reject →** `reject_leave(request_id, reason?)`.
- Show `attachment_url` as a "view proof" link when present.

### 5. Add leave (office logs on a worker's behalf)
- **`add_leave_request(p_staff_id, p_leave_type, p_start_date, p_end_date, p_days, p_reason?, p_attachment_url?, p_status?)`** — same shape as the worker's, but the office picks the worker and may pass `p_status:'approved'` to log already-agreed leave in one step.
- Attach proof later → **`set_leave_attachment(request_id, url)`**.

### 6. Set entitlement / override
- **`set_leave_entitlement(p_staff_id, p_year, p_annual_days?, p_carried_days?, …)`** — leave `p_annual_days` **blank** to follow the statutory tier automatically, or type a number to **override**. `p_carried_days` = days brought forward.

### 7. Join-date field (on the worker profile page)
- **`set_staff_join_date(p_staff_id, p_date_joined)`** — a date picker. Until it's set, the worker shows the **8-day floor** (and `date_joined_missing = true` in the balance report).

---

## Cross-cutting notes

- **How to call:** `const { data, error } = await supabase.rpc('request_leave', { p_device_token: token, p_leave_type: 'annual', p_start_date: '2026-08-01', p_end_date: '2026-08-03', p_days: 3 })`.
- **Auth:** worker screens use the **anon** client (these functions are granted `anon`). Office screens need a logged-in office user (`authenticated`) or a server-side service-role call — reuse whatever pattern the dashboard already uses for `get_recent_punches`.
- **Every function replies `{ ok: true/false, code }`.** On `ok:false`, show a friendly message for the `code` — e.g. `unknown_device`, `bad_dates`, `bad_days`, `bad_leave_type`, `days_exceed_range` (days is more than the number of calendar days between the dates), `unknown_staff`, `not_found`.
- **Rules:** types = `annual | mc | unpaid | emergency`; only **approved annual** leave counts against the balance. Worker requests are always `pending` (a worker can't self-approve).
- **Full API reference:** `hf-database/README.md` (the "function API" section).
