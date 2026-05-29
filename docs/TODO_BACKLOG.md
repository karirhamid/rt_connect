# RT Connect — Deferred items backlog

Items surfaced by the May 2026 senior code + HR-domain audit that you chose
to defer. They are **not bugs in current outputs** — they are real gaps that
will matter for specific scenarios (night-shift staff, paid leave, payroll
compliance, etc.). Each entry tells future-you what was found, where it
lives in the code, what the audit recommends, and the decision left to
make.

Order is unchanged from the audit — letter labels (A, B, D, …) match the
post-audit summary in the conversation. C and H are included here for the
same reason: anything left open belongs in one list.

---

## DECISIONS — 2026-05-29 (client review)

The client went through every item. Verdicts, to drive the build order:

| Item | Verdict |
|---|---|
| A. Night shifts | **Defer** — revisit later; no night staff right now. |
| B. Leave / congés | **BUILD — high priority.** Full module with HR approval workflow + employee portal signing. Detailed spec captured in § B below. |
| C. Holiday premium | **Drop** — not needed for this project. |
| D. Split shifts | **Drop** — no split-shift staff. |
| E. Lateness grace | **BUILD — parametrable.** Must be a Settings value the client can change per site, NOT hard-coded. Default keeps today's strict (0 min) behaviour. |
| F. Email on holidays | **Keep sending.** If anyone punched (la garde), show those punches; if nobody did, send a clean PDF naming the holiday. Mostly current behaviour — just verify the empty-but-holiday case renders well. |
| G. Dept history | **Drop** — not relevant for this client. |
| H. Shared-mode schedule conflict | **My recommendation: earliest `work_start` wins** (strictest = safest for lateness; a cloned device row can never make someone look *less* late). Cheap, deterministic, no UI. Will implement that unless you object. |
| I. Portal brute-force | ✅ **DONE** — commit 2e502f1. |
| J. Backup key rotation | **BUILD — safest option.** Warn the admin on decrypt failure AND store a key fingerprint so a rotated key is detected proactively, not after a silent backup failure. |
| K. PDF N+1 | **BUILD — fix proactively.** Pre-load day summaries; pure perf, no output change. |

Plus a NEW feature requested the same day:

| New | Punch-review / entrée-sortie override table — see § NEW below. **Design first, then build.** |

Suggested build order (smallest-risk / highest-value first):
1. **K** (perf, pure refactor, no behaviour change) — quick win.
2. **NEW punch-review override** (fixes the recurring multi-punch ambiguity the client keeps hitting).
3. **E** (parametrable grace — small, self-contained).
4. **J** (backup key safety — small, security).
5. **B** (congés — large, its own milestone).
6. **F** (verify/adjust holiday-email empty case — small).
7. **H** (tie-break rule — tiny, fold into any classifier change).
8. **A** (night shifts — when night staff actually exist).

---

## A. Night shifts crossing midnight

**Status:** broken silently — currently produces `total_minutes = 0`.

**Where:** `backend-api/app/services/punch_classifier.py:516-525`
(`get_employee_day_summary`).

**What's wrong:** `entry_time` and `exit_time` are `HH:MM` strings parsed
with `datetime.strptime(entry, "%H:%M")` — both anchored to 1900-01-01.
For a 22:00 → 06:00 shift, `06:00 − 22:00 = −16h`, then `max(0, diff) → 0`.
Net effect on a real night-shift employee:

- `total_minutes = 0`
- `overtime_minutes = 0`
- `late_minutes` against a 22:00 start is computed only if the entry happens
  to be on the same calendar date — but the punches at 22:05 (Mon) and
  05:30 (Tue) end up under TWO different `DailyShiftRecord` rows (one with
  entry-only, one with exit-only), each "incomplete".

**What the audit suggests:**
1. When `record.work_end < record.work_start` (overnight flag), add 24h to
   the exit datetime before subtracting.
2. Bucket the day by the work_start's calendar date, not by the punch's
   calendar date — so a 22:00 → 06:00 shift sits on one row.
3. Expose `is_overnight` on the day summary so the PDF can show "nuit"
   instead of "incomplet" when only one of the two calendar dates is in
   range.

**Decision needed before fixing:**
- Do any current employees actually work night shifts? (Confirm with client.)
- If yes: should the lateness ranking treat 22:05 as "5 min late" the same
  way 09:05 is treated for day shifts? (Probably yes, but verify.)
- A deep design doc already exists at `docs/NIGHT_SHIFT_GUARD.md` for the
  full "la garde / holiday duty" feature. The fix described here is the
  *plumbing* prerequisite for that feature — see the appendix added there.

**Existing related code that's correct:** the classifier already has an
`is_overnight` concept on `ShiftTiming` (`shift_schema.py:57+`); the day
summary just doesn't consult it.

---

## B. Annual / sick leave not modelled

**Status:** real omission — employees on paid leave show as **Absent** in
reports.

**Where:** no `LeaveDay` / `LeaveRequest` table exists in
`backend-api/app/database/schema.py` or `shift_schema.py`. The "absent"
calculation in `reports.py:_holidays` + the absentees section uses
"employee did not punch and the day isn't a holiday / day-off" — there's
no third category for "on leave".

**What's wrong:** the PDF lists them under *Absentees* during a vacation,
which is wrong-looking to HR and confusing to the employee.

**What the audit suggests:**

Minimal table:
```
leave_days (
  id PK,
  employee_id FK → employees.id,
  date DATE,
  type ENUM('annual', 'sick', 'unpaid', 'other'),
  approved BOOL DEFAULT FALSE,
  reason TEXT,
  created_by FK → users.id,
  created_at TIMESTAMP,
  UNIQUE(employee_id, date)
)
```

Plus three small UI changes:
1. A "Congés" tab under `/settings` or as a sub-section of
   `/employees/<id>` so HR can mark dates.
2. The Reports absentees section excludes any (employee, date) pair that
   has a row in `leave_days` with `approved=True`.
3. The Reports per-employee section can render a small badge (`Congé`,
   `Maladie`) on those rows instead of leaving them blank.

**Decision needed before fixing:**
- Do you want this lightweight (just suppress "Absent") or full HRIS
  (with annual-balance tracking, manager approval workflow, etc.)?
- Should sick leave require a `medical_certificate` upload, or just a
  date?
- Is "other" needed (bereavement, marriage, maternity etc.) or one
  `type=other + reason TEXT` is enough?

---

## C. Holiday-work premium for Moroccan payroll

**Status:** payroll-compliance gap.

**Where:** `backend-api/app/api/payroll_export.py` plus
`backend-api/app/services/punch_classifier.py` (no `holiday_premium`
field on the day summary).

**What's wrong:** Moroccan labour law typically requires 100–150% premium
pay for hours worked on a public holiday ("la garde" staff). The system
correctly counts the worked time but doesn't flag it as "holiday hours",
so the payroll export treats them like normal hours.

**What the audit suggests:**
- Add a `is_holiday: bool` and `holiday_hours: float` to the day-summary
  dict so downstream consumers can apply the multiplier.
- New `app_settings` columns: `holiday_premium_pct` (default 150),
  `weekend_premium_pct` (default 100 = no premium), per Moroccan default.
- Payroll export adds a "Heures fériées" column.

**Decision needed before fixing:**
- Confirm with the client what their actual premium rates are (50%? 100%?
  150% on the second day of Aid?). Implementations vary by collective
  agreement.
- Should overtime that happens to fall on a holiday compound (e.g.
  150% × 125% = 187.5%)?

---

## D. Split-shift / multi-shift employees

**Status:** real omission for any role with split shifts (8–12 + 14–18,
etc.). No measurement of the afternoon late return.

**Where:** `backend-api/app/database/shift_schema.py:53-81`
(`ShiftTiming` has a single `start_time`/`end_time`); resolver returns
**one** timing per (employee, day) at
`backend-api/app/services/punch_classifier.py:158-167`.

**What's wrong:** an employee scheduled 08:00–12:00 then 14:00–18:00 who
arrives back at 14:15 is **not** flagged late on the afternoon shift. Only
the morning's 08:00 is compared.

**What the audit suggests:**
- Allow multiple `ShiftTiming` rows per (shift_id, day_of_week) and have
  the resolver pick the timing whose [start, end] window contains the
  punch.
- Or: model split shifts as `morning_start/morning_end` +
  `afternoon_start/afternoon_end` on a single timing row (simpler schema,
  harder to extend to three shifts).

**Decision needed before fixing:** does the client actually have split
shifts? Many biology labs run continuous coverage; only office workers
typically have split. **Confirm with client before designing.**

---

## E. Per-department lateness grace period

**Status:** schema-ready, just not read.

**Where:** `shift_timings.late_grace_minutes` exists in
`backend-api/app/database/shift_schema.py:74` but
`get_employee_day_summary` ignores it. The new lateness module's
documentation explicitly says **minute-exact, no grace**.

**What's wrong / what's by design:** today the rule is uniform across the
company (no grace). The schema *suggests* per-shift grace was originally
intended but never wired up.

**What the audit suggests:**
- Read `late_grace_minutes` from the resolved `record` and subtract from
  the raw late minutes: `late = max(0, late_raw − grace)`.
- Add a "tolérance par défaut" global setting on `app_settings` so the
  super admin can set, e.g., 5 min globally without editing every shift.

**Decision needed:**
- Stay minute-exact (current behaviour, simpler, the lateness module's
  whole pitch), OR
- Allow grace per shift (more realistic for real workplaces), OR
- Allow grace per role (warehouse = 0, office = 15) — needs a new dimension.

---

## F. Daily-email PDF on holidays

**Status:** debatable — currently the email goes out with the holiday
banner.

**Where:** `backend-api/app/services/scheduler.py:_tick` and the
`run_schedule` path — neither consults the Holiday table.

**What's wrong / what's by design:** on Aid Al-Adha morning, HR receives
a PDF for "yesterday" (which was the first day of Aid). The PDF correctly
shows the banner. Some clients consider this useful ("see who was on
duty"), others consider it noise.

**What the audit suggests:**
- Add `skip_on_holiday: bool` per `ReportSchedule` (default False = current
  behaviour). When True, the scheduler checks if `period_end` is a
  holiday and skips sending if so.

**Decision needed:** is the holiday PDF useful or noisy for the lab's HR?

---

## G. Employee changes department mid-period

**Status:** real omission for cross-period departmental reporting.

**Where:** `backend-api/app/database/schema.py:52` — `Employee.department_id`
is "current only", no history table.

**What's wrong:** an employee who was in *Réception* until 15 May and
*Technique* from 16 May, when included in a May report, shows entirely
under *Technique*. The 1-to-15 May rows are mis-attributed.

**What the audit suggests:**
```
employee_department_history (
  id PK,
  employee_id FK,
  department_id FK,
  effective_from DATE,
  effective_to   DATE NULL  -- NULL = current
)
```
Reports join by date range. Existing `Employee.department_id` becomes a
cached "current" pointer.

**Decision needed:** does this matter for the lab? Department changes are
rare enough that some shops accept the limitation; others (with
department-bonus payroll) absolutely need history.

---

## H. Shared-mode schedule conflict tie-break

**Status:** silent first-wins.

**Where:** `backend-api/app/services/punch_classifier.py:498-508` and
`reports.py:1955-1959`.

**What's wrong:** in `shared` mode, when matricule 1001 has `Employee.id=5`
with schedule 09–17 and `Employee.id=8` (clone) with schedule 08–16,
lateness is computed against whichever PK SQL returned first. No rule, no
warning.

**What the audit suggests:**
- In shared mode, fetch all candidate schedules across `all_pks` and pick
  the earliest `work_start` (strictest, safest for "late" semantics).
- Optionally log a one-time `WARNING` when conflicting schedules are
  detected so HR can resolve the duplicate.

**Decision needed:** earliest-wins? Latest-wins? Or "raise an HR alert and
refuse to compute lateness until resolved"?

---

## I. Portal-PIN brute force protection — **DONE (commit 2e502f1, 2026-05-29)**

**Status:** ✅ shipped — 5 failures → 15 min lockout, DB-tracked counter.
Tuning via env: `MAX_PORTAL_ATTEMPTS`, `PORTAL_LOCKOUT_MINUTES`.

---

### (original entry, for context)

**Status:** real security gap.

**Where:** `backend-api/app/api/employee_portal.py` — login endpoint has
no rate limit, no attempt counter, no lockout. Initial login compares
against the employee's first name lowercased.

**What's wrong:** an attacker can iterate common first names (Mohammed,
Fatima, Ahmed, etc.) across the matricule space and likely log in as
*someone* within hours.

**What the audit suggests:**
- Add `slowapi` (already a small dep) with `@limiter.limit("5/minute")`
  per `(matricule, IP)` on `/api/portal/login`.
- Or: add `portal_failed_attempts` + `portal_locked_until` columns on
  `Employee`. Lock for 15 min after 5 failures.
- Force a real password (≥8 chars, not the first name) on first login.

**Decision needed:** which mechanism? `slowapi` is cheaper, the column
approach gives admin visibility.

---

## J. Backup encryption-key rotation handling

**Status:** silently corrupting.

**Where:** `backend-api/app/core/crypto.py:41-54` — `decrypt_secret`
catches `InvalidToken` and returns `""` (empty string).

**What's wrong:** if the operator rotates `BACKUP_ENC_KEY` (a real
incident — e.g. key compromise), every encrypted SMB password becomes
undecryptable. `decrypt_secret` returns empty, the backup tries to
authenticate with no password, the SMB server returns "auth failed", the
admin sees a generic error with no hint that the **key rotated**.

**What the audit suggests:**
- Return `None` on decryption failure (typed signal vs ambiguous empty
  string).
- The backup flow detects `None` and emits a clear warning:
  `"SMB password cannot be decrypted — BACKUP_ENC_KEY may have rotated. Re-enter the password in Settings → Maintenance."`
- Optionally: store the key fingerprint (first 8 chars of the SHA256)
  alongside each encrypted blob so we can detect the mismatch
  proactively.

**Decision needed:** just the warning, or also the fingerprint check?

---

## K. N+1 in PDF report generation

**Status:** performance — fine today (a 1k-row report takes ~2 s on dev)
but will bite at scale.

**Where:** `backend-api/app/api/reports.py:748-800` — per (employee, day)
row the PDF calls `get_employee_day_summary()`, which itself runs at least
one query for the schedule lookup.

**What's wrong:** for a 1000-row report, ~2000 DB round-trips. On a
fast network this is invisible; on a saturated VM or with 100+
concurrent reports it could exhaust the pool (`pool_size = 5` by
default).

**What the audit suggests:**
- Pre-load all summaries with a single grouped query keyed by
  `(employee_id, date)` and look them up in the loop.
- Or: cache the schedule lookups per `(employee_id, day_of_week)` since
  the same weekday hits the same schedule.
- Add an index on `daily_shift_records(employee_id, date)` if it's not
  there already.

**Decision needed:** fix proactively now, or wait until someone complains
about a slow report?

---

## Other items the audits flagged that we kept as-is

These were considered and explicitly chosen not to act on. Listed so
future-you sees the reasoning:

- **Reports.py is 2000+ lines** — splitting into focused modules is a
  good idea, but pure code-quality. Defer until the file changes again.
- **DEBUG → INFO logging** — done in commit `5a16a42`, already shipped.
- **Portal 12h token** — by design (one shift = 8h is shorter; you
  picked longer for convenience). Documented.
- **Foreign-key `ON DELETE` clauses missing** — current behaviour is
  `RESTRICT`. Adding `SET NULL` would change the meaning of
  attendance rows for departed employees. Need an HR decision.

---

## When you come back to this file

For each item:

1. Confirm the scenario matters for the client (don't waste effort on
   night shifts if nobody works nights).
2. Pick one of the "What the audit suggests" branches OR design your own.
3. The fix MUST preserve the outputs of the cases that work today
   (same constraint as the May 2026 hardening pass).
4. Add a test if at all possible — the codebase currently has only one
   test file (`backend-api/tests/test_auth_flow.py`).

Last audit pass: **May 28 2026** — see commit `5a16a42` for the fixes
that already shipped.

---

# NEW. Punch review / entrée-sortie override ("Validation des pointages")

**Requested:** 2026-05-29. **Status:** design — build after approval.

## The problem it solves

Biometric devices record a punch every time someone presents a finger, with
no reliable in/out flag. When an employee punches **3+ times in a day**
(e.g. 07:00, 13:00, 15:57) the auto-detection can pick the wrong pair, or —
as seen with Ikram — tag every afternoon punch as "exit" and leave the
entrée blank. The immediate display bug (entrée blank) was fixed in commit
6af0d2d by falling back to first/last. But the client wants a **manual
review surface** so a human can decide, for any ambiguous day, exactly which
punch is the entrée and which is the sortie — and have that choice flow into
the reports, the Today page, and the lateness math.

## Design (approved approach: per-day override, keeps all punches)

### Data model — new table `attendance_day_resolution`
```
id                  PK
user_id             matricule (logical person — works in shared mode where
                    one person has several Employee rows across devices)
date                DATE
entry_attendance_id FK attendance.id, nullable  (the punch chosen as entrée)
exit_attendance_id  FK attendance.id, nullable  (the punch chosen as sortie)
resolved_by         users.id
resolved_at         TIMESTAMP
note                TEXT nullable
UNIQUE(user_id, date)
```
Why store the chosen punch IDs (not just times): keeps a precise audit trail
and survives re-sync. Why `user_id` not `employee_id`: the override is per
logical person per day, device-agnostic.

### Single integration point
`get_employee_day_summary()` gains a first step: look up a resolution for
(user_id, date). If found, force entry_time / exit_time from the chosen
punches and recompute total/late/overtime from them. Because the report
display (after fix 6af0d2d) already prefers the summary's entry+exit when
BOTH are present, and the Today page + lateness all flow through this same
function, the override automatically takes effect EVERYWHERE with no other
code change. That's the key to "must not impact other features" — when no
resolution row exists, behaviour is byte-for-byte unchanged.

### "Needs review" detection
A (person, day) qualifies when it has **>=3 effective punches** (after the
existing double-tap merge). Simple, matches the client's words ("more than
2 times in different timing"). Already-resolved days show a check badge.

### API
```
GET  /api/attendance/review?start=&end=&employee_ids=
       -> list of {user_id, name, date, punches:[{id,time}], resolution?}
       for days with >=3 effective punches in range.
POST /api/attendance/review
       body {user_id, date, entry_attendance_id, exit_attendance_id, note}
       -> upsert the resolution. Validates both IDs are that person's
         punches on that date.
DELETE /api/attendance/review/{user_id}/{date}
       -> remove the override (revert to auto-detection).
```
Gate behind an existing manager permission (e.g. `attendance.write` /
`corrections.write`) — confirm which.

### UI
A "Validation des pointages" panel (below the Reports page as the client
asked, or its own route — TBD). Per ambiguous row: the day's punches shown
as a timeline with two selectors (Entrée / Sortie). Save writes the
override; the row gets a check; the figure is immediately reflected on
re-generating the report and on the Today page.

### Simpler alternative considered (and why not)
Could reuse the existing **corrections/void** feature: void the middle
punch so first/last = entry/exit. Rejected because (a) it hides the fact the
person badged 3x, (b) worse UX than a pick-entry/pick-exit table, (c) the
client explicitly described a review table. The override keeps every punch
visible and just *designates* entry/exit — data-honest.

### Phasing
1. Table + migration + override lookup in get_employee_day_summary + the
   three endpoints. (Backend only — already testable via API.)
2. Frontend review panel.

### Must-not-break checklist
- No resolution row -> identical output to today.
- Override only changes the designated entry/exit + derived figures for
  that one (person, day).
- Re-sync never deletes a resolution (it references punch IDs that persist).

---

# B (detailed). Leave / Congés module — client spec (2026-05-29)

**Status:** BUILD, high priority, its own milestone. Captured from the
client so nothing is lost.

## Roles & workflow
- A new **HR-congé role** is created that manages congés for ALL employees.
- **Reporting-user role** AND HR can *create* a congé request (demande) for
  an employee — but creating it does NOT make it take effect; it needs
  **approval by the HR-congé role**.
- Each employee has a **congé balance table**: e.g. 18 days/year (or more),
  set by HR. Tracks days available, days used, reset cycle, and full history
  (including congé maladie / sick leave).
- Creating a demande: choose the employee + the période (date range) ->
  generates an **A4 PDF demande de congé** that can be printed and signed by
  the employee. OR, if the portal is enabled, the employee logs into their
  portal, sees their balance + history, sees the demande created for them,
  and **signs it electronically**. Once signed it returns to HR flagged
  "signed by employee", and HR approves it.
- On approval: that period no longer counts the employee as **absent**;
  instead it shows in a separate **congé table**, and **no retard is
  computed** for those days.

## Employee portal additions
- See their congé balance (total / used / remaining / reset date).
- See full history: all congés + congés maladie.
- See demandes created for them; sign them.

## Settings (parametrable)
- Whether **Saturday/Sunday count** as congé days or not when computing the
  span of a leave.
- The demande-de-congé module adds **one day by default** (clarify with
  client what this means exactly before building).

## Rough data model (to refine at build time)
```
leave_balances(employee_user_id, year, entitled_days, carried_over, ...)
leave_requests(id, employee_user_id, type[annual|sick|other],
               start_date, end_date, working_days, status[draft|
               pending_employee_sign|signed|approved|rejected],
               created_by, approved_by, employee_signed_at, approved_at,
               reason, pdf_path?, ...)
```
Reports: a (person, day) covered by an approved leave_request is excluded
from "Absent" and from lateness, and listed in a dedicated Congés section.

## Open questions for the client before building
1. Sick leave (congé maladie): does it draw from the same balance or a
   separate one? Require a certificate upload?
2. "Adds one day by default" — default to a 1-day request, or always +1 to
   every request span? Need clarification.
3. Half-day congés — needed?
4. Who can create the HR-congé role / assign it — super admin only?

---

# E (detailed). Parametrable lateness grace

Client wants the grace period to be a **Settings value**, not hard-coded,
changeable per site. Plan: add `late_grace_minutes` to AppSettings (default
0 = current strict behaviour), surface it in Settings -> Général, and apply
`late = max(0, raw_late - grace)` inside get_employee_day_summary. The
existing per-shift `shift_timings.late_grace_minutes` can stay as an
optional override on top later if needed.

---

# J (detailed). Backup key-rotation safety

Do BOTH (client said "safest"):
1. `decrypt_secret` returns a typed failure (None) instead of "" so the
   caller can tell "decryption failed" from "empty password".
2. Store a short fingerprint (first 8 hex of SHA256 of the active key)
   alongside each encrypted blob. On backup, if the stored fingerprint
   doesn't match the current key's, surface a clear admin warning
   ("BACKUP_ENC_KEY changed — re-enter SMB password") instead of silently
   attempting auth with an empty password.

---

# K (detailed). PDF generator N+1

Pre-load every (employee, day) summary in ONE grouped pass before the row
loop instead of calling get_employee_day_summary per row. Pure performance;
output identical. Verify a before/after byte-diff of a multi-row PDF is
empty.
