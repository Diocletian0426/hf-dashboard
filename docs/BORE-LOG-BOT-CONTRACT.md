# Bore logs — how the WhatsApp bot writes them into the database

## The golden rule

**The bot never writes a bore log. It hands one in.**

`bore_logs` is the permanent as-built record — one row per pile, and the row is
what the monthly claims are built on. The bot cannot write to it, and this is
enforced, not just asked for: `service_role` has no INSERT/UPDATE/SELECT on that
table, RLS is on with zero policies, and `approve_bore_log_submission` is granted
to `authenticated` only.

What the bot writes to is `bore_log_submissions` — a staging table. A person then
opens it on the dashboard, checks it against the scan, and presses Confirm. That
is what creates the bore log.

The practical consequence, and it is a good one: **the worst a broken bot can do
is create a bad draft that somebody rejects.** It cannot corrupt a confirmed
record. Experiment freely.

---

## What actually arrives

A **PDF of the certified sheet**, posted to a site group. Checked against the real
files: these are scanned pages with **no text layer at all** — zero fonts, just
compressed images — and the values are **handwritten**. Nothing can be pulled out
as text; the sheet has to be read as a picture. The bot already does this
reliably, which is what makes the rest of this document possible.

---

## Connection

```
Project URL : https://fwuftjunybbxlhwauxta.supabase.co
Key         : the SERVICE ROLE key — ask the owner directly, do not paste it
              into chat. It bypasses all row security; treat it like a password.
```

Use it as a normal Supabase client (`supabase-js`, `supabase-py`, or plain REST
against `/rest/v1/rpc/<function>`).

---

## Recommended flow: let the extractor be the detector

The hard part is not reading a bore log — it is knowing which arriving PDF *is*
one. There is no training set for that, and guessing would drop invoices and
claim certificates into the reviewer's inbox, which is worse than doing nothing.

**So don't guess. Extract first, and let the result decide.**

```
1. a PDF arrives in a group
2. run extraction on it
3. did a toe level AND a cut-off level come out, as plausible mRL numbers?

     NO  -> it was not a bore log. Drop it silently. Nothing is created,
            nothing reaches the inbox.

     YES -> 4. upload the file to storage
            5. create_bore_log_submission
            6. claim_bore_log_extraction
            7. record_bore_log_extraction  (returns errors + warnings — log them)
```

An invoice will never yield a toe level. A claim certificate will not either. The
document's own shape does the classifying, using the reader you already have — no
examples, no threshold to tune, and nothing false landing in front of a human.

Note this puts **extraction before upload**, the reverse of how a person uses the
dashboard. That is deliberate and fine: the RPCs only require the file to be in
storage before `create_bore_log_submission` names its path.

`record_bore_log_extraction` then gives you a second gate for free — it returns
the same validation the dashboard runs, so a document that extracted into
nonsense says so.

---

## Step A — put the file in storage

Bucket **`bore-logs`** (private). Path must start with `submissions/`:

```
submissions/<submission_id>/<n>-<safe_filename>
```

- `<submission_id>` is a UUID **you generate** and reuse in step B
- `<n>` is 1, 2, 3… if one message carries several photos/pages
- `<safe_filename>` — strip anything that is not `A-Za-z0-9._-`, cap ~80 chars.
  The real filename is kept on the row, so nothing is lost.

Example: `submissions/9f2c.../1-borelog_A2.pdf`

PDFs and images are both fine — the review screen shows a PDF inline and photos
in a zoomable viewer, and it decides per file, so a mixed message works.

**A submission with no file is rejected.** A bore log that cannot be looked at
cannot be verified, so at least one path is required.

---

## Step B — register the submission

```
rpc: create_bore_log_submission
  p_submission_id     uuid    the one you just used in the path
  p_source            text    'whatsapp'          <- required, exact string
  p_storage_paths     jsonb   ["submissions/.../1-x.pdf", ...]   <- array, non-empty
  p_project_id        uuid    optional
  p_pile_id           uuid    optional
  p_file_hash         text    optional, sha-256 hex of the first file
  p_original_filename text    optional
  p_mime_type         text    optional
  p_file_size_bytes   bigint  optional
  p_wa_message_id     text    the WhatsApp message id   <- SEND THIS
  p_wa_sender         text    who sent it
  p_captured_at       timestamptz  when it was sent
returns: uuid
```

**If you can work out the pile, send `p_pile_id`.** Two ways, most reliable
first: the pile mark you extracted off the sheet, or the filename/caption
(`A-2.pdf` → ABT A2). If neither is confident, send null — that is a normal case
and exactly why the staging table exists. The reviewer picks the pile on screen
with a site → zone → pile chooser.

**Always send `p_wa_message_id`.** It is the idempotency key: if the same message
id is submitted twice, the function returns the existing submission id instead of
creating a duplicate or throwing. That makes retries safe — if your network drops
after the upload, just call it again.

> If your gateway does not persist the WhatsApp message id yet, a stable
> stand-in derived from your own row is acceptable and keeps retries safe. It is
> still worth capturing the real id when convenient, for two reasons: a derived
> key is only as stable as what it is derived from — recreate the row or change
> the formula and the same message yields a different key, which is the duplicate
> the key existed to prevent — and the real id lets a disputed figure be traced
> back to the actual message months later.

---

## Step C — hand over what you read

```
rpc: claim_bore_log_extraction(p_submission_id)      -> marks it 'processing'
rpc: record_bore_log_extraction(
       p_submission_id, p_ai_raw, p_ai_fields, p_ai_model, p_ai_prompt_version)
rpc: fail_bore_log_extraction(p_submission_id, p_error)   -> on failure
```

- `p_ai_raw` — whatever your reader returned, unedited. Kept for audit.
- `p_ai_fields` — the cleaned values, in the shape below.
- `p_ai_model` / `p_ai_prompt_version` — free text, shown on the review screen so
  a reviewer knows what read the sheet.

`record_bore_log_extraction` runs the **same validator** the dashboard uses and
returns `{errors: [...], warnings: [...]}`. Those become the "N to fix / N to
check" badges in the office inbox. **Read the return value** — if `errors` is
non-empty, a human cannot confirm it until it is fixed, so log it.

### Handwriting will occasionally be misread. Plan for it.

**Omit a field you are not confident about. Never guess one.**

A blank box gets typed in by the reviewer, who is looking at the sheet anyway. A
confidently wrong number gets skimmed past and confirmed — and these figures feed
the monthly claims. Partial extraction is not a degraded result here, it is the
correct one.

Two traps worth guarding specifically:

- **Minus signs.** Toe and rock levels are usually negative. Dropping a minus
  turns a −22.530 toe into +22.530. The validator catches that particular one
  because it makes the pile geometrically impossible — but a wrong magnitude that
  is still plausible sails straight through.
- **Decimal points.** `7.319` read as `73.19`. Same problem, no safety net.

If your reader gives a confidence signal, use it: below your threshold, leave the
field out.

---

## The field shape (`p_ai_fields`)

All keys optional. **Omit rather than guess.**

```jsonc
{
  // LEVELS — metres, mRL. Going DOWN the pile these get SMALLER.
  "top_of_casing_level_m":    12.900,
  "piling_platform_level_m":  11.670,   // EGL
  "cut_off_level_m":           7.319,   // required before anyone can confirm
  "rock_socketing_level_m":  -15.030,   // top of the rock socket
  "toe_level_m":             -22.530,   // required before anyone can confirm

  // BORING TIMES — any timestamp Postgres can read
  "boring_soil_started_at": "2026-07-04T08:20:00+08:00",
  "boring_soil_ended_at":   "2026-07-04T14:05:00+08:00",
  "boring_rock_started_at": "2026-07-04T14:30:00+08:00",
  "boring_rock_ended_at":   "2026-07-05T09:10:00+08:00",

  // AS BUILT
  "as_built_diameter_mm":      450,
  "temporary_casing_length_m":   6.0,
  "permanent_casing_length_m":   0,

  // CONCRETE
  "concrete_grade":     "C30",
  "cast_date":          "2026-07-05",
  "actual_concrete_m3":  8.00,

  // SOIL STRATA — DEPTHS IN METRES BELOW THE PLATFORM.
  // Note: the OPPOSITE direction to the levels above. Bigger = deeper.
  // No SPT field — the site does not record it.
  "soil_layers": [
    { "from_depth_m": 0,    "to_depth_m": 3,    "description": "Medium Brown Soil" },
    { "from_depth_m": 3,    "to_depth_m": 9,    "description": "Silty Clayey Sand" },
    { "from_depth_m": 26.7, "to_depth_m": 34.2, "description": "High Strength Granite" }
  ],

  // STEEL CAGE — top cage first
  "reinforcement": {
    "starter_bar_length_m": 1.0,
    "cages": [
      { "seq": 1, "main_count": 8, "main_dia_mm": 25, "length_m": 12,
        "spiral_dia_mm": 12, "spiral_pitch_mm": 200, "lap_to_next_m": 1 },
      { "seq": 2, "main_count": 8, "main_dia_mm": 25, "length_m": 12,
        "spiral_dia_mm": 12, "spiral_pitch_mm": 200, "lap_to_next_m": 1 },
      { "seq": 3, "main_count": 8, "main_dia_mm": 25, "length_m": 8.85,
        "spiral_dia_mm": 12, "spiral_pitch_mm": 200 }
    ]
  },

  "remarks": "anything worth passing on"
}
```

---

## Rules that will get it rejected

**1. Numbers must be JSON numbers, not strings.**
`"12.5"` fails, `12.5` passes. This is the single most common mistake.

**2. The bottom cage has no lap.**
`lap_to_next_m` is how far a cage's bars run *down into the cage below*, so
**n cages have n−1 laps**. Putting one on the last cage is rejected — and it
would have invented steel that was never tied.

**3. Soil strata are depths from the platform, not levels.**
Everything else on the record is a level in mRL. `soil_layers` is the one
exception, because that is how the certified sheet is written. Do not convert.
Each layer needs a `from_depth_m`, a `to_depth_m` deeper than it, and a
`description`.

**4. Cages are numbered 1 upwards, top first**, and each needs at least
`main_count`, `main_dia_mm` and `length_m`.

**5. Geometry that cannot exist is refused**: cut-off at or below the toe, a rock
socket below the toe or above the cut-off, a cast date in the future, boring that
finished before it started, a diameter outside 300–3000 mm.

**6. Never send `agreed_bored_depth_m`, `agreed_pile_length_m`,
`agreed_rock_socket_length_m` or `agreed_basis`.**
Those are *commercial overrides* a human sets when a figure was agreed on site
rather than measured — they change what gets claimed. They are not on the
document and the bot must never invent one. Leave them out entirely and the
system calculates from the levels, which is correct.

Also: **do not send pile length, bored depth or rock socket length.** All three
are worked out from the levels. Just send accurate levels.

---

## What happens next

1. The submission appears in the office inbox with its site, zone, pile and file
   count, plus any error/warning counts from your extraction.
2. A reviewer opens it: scan on the left, values on the right.
3. They fix anything wrong and press **Confirm this bore log**.
4. Only then is the `bore_logs` row written and the figures published to the pile
   register and the claims.

If a second bore log is later confirmed for the same pile, it **replaces** the
first, and the earlier submission is marked `superseded` — nothing is deleted.

---

## Quick checklist

- [ ] extract FIRST — no toe level and cut-off level means it was not a bore log,
      so drop it and create nothing
- [ ] upload to `bore-logs` under `submissions/<uuid>/...`
- [ ] `create_bore_log_submission` with `p_source: 'whatsapp'` and the real
      `p_wa_message_id`
- [ ] send `p_pile_id` when the mark or filename makes it confident, null when not
- [ ] `claim` → `record` (or `fail`), and log the errors/warnings returned
- [ ] omit anything you are unsure of — a blank box beats a wrong number
- [ ] numbers as numbers, no lap on the bottom cage, strata as depths
- [ ] never send the `agreed_*` fields
- [ ] retries are safe — same `p_wa_message_id` returns the same submission
