# Punch Logic — Merging + Schedule-aware classification

> Approved 2026-05-19. Implementation lives in `punch_classifier.py` +
> `reports.py`. This doc captures the design decisions so future tweaks
> are traceable.

## Problem

1. **Near-duplicate punches** — same employee taps multiple times within
   seconds/minutes (forgot, wasn't sure it registered). They appear as
   separate rows in reports.
2. **Out-of-window punches** — someone punches well outside their
   scheduled hours. Today they show up as "On time" or undifferentiated.
3. **Absentees** — currently treated as a single bucket: everyone in the
   org who didn't punch. But that includes people on day-off, vacation,
   weekend. False positives.

## Decisions

| | Choice | Rationale |
|---|---|---|
| **Merge window** | 5 minutes (configurable 0–30 min) | Catches double-taps without merging legitimate quick re-entries |
| **Schedule source** | Per-employee assigned shift (fall back to "no schedule") | Matches the data model we already have; per-emp granularity |
| **Merge audit** | Show original count next to merged punch (`1 (3 fusionnés)`) | Admins can see what was merged; raw data preserved |
| **Where merging happens** | At report time, not sync time | Reversible, tunable per-deployment, easier to debug |
| **Entry/Exit window** | ±2 h of scheduled work_start / work_end | Conservative — most real "late arrivals" fit |

## Three absentees buckets

Replace the single "Employés sans pointage" section with:

1. **Absents** (red) — employee has a shift today, zero punches
2. **Pointage incomplet** (amber) — has a shift today, only entry or only exit (after merging)
3. **Hors planning** (grey) — punched, but no punch fell within their
   expected entry/exit windows

Employees with **no shift on this date** (day off, weekend, vacation)
are not listed in any bucket. That's the "respect the schedule" rule.

## Algorithm

### Per employee, per day:

```
1. Fetch raw punches sorted by timestamp
2. Merge close punches:
     merged = [punches[0]]
     for p in punches[1:]:
         if p.ts - merged[-1].ts < window_seconds:
             continue   # silently merged
         merged.append(p)
3. Resolve entry / exit:
     if employee has shift for date:
         entry = first punch within ±2h of work_start, or None
         exit  = last  punch within ±2h of work_end,   or None
         out_of_window = punches that matched neither
     else:
         entry = first(merged)   # current behavior
         exit  = last(merged)
4. Classify into bucket:
     - has_shift + no punches      → Absent
     - has_shift + entry only      → Incomplet
     - has_shift + exit only       → Incomplet
     - has_shift + only out_of_win → Hors planning
     - punched fully               → Normal row in main table
```

### Cluster size tracking

Each merged-and-kept punch carries an `original_count` field — number of
punches that collapsed into it. Rendered in the Passages cell as
`1 (3 fusionnés)` when > 1.

## Settings

One new field in `app_settings`:

```sql
ALTER TABLE app_settings
ADD COLUMN IF NOT EXISTS punch_merge_window_min INTEGER DEFAULT 5;
-- 0 = disabled (no merging)
-- 1-30 = window in minutes
```

UI: **Paramètres → Général → PDF** tab gets one number input.

## What does NOT change

- The `attendance` table — raw punches stay exactly as the device sent them
- Existing report endpoints — no breaking signature changes
- Schedule data model — uses existing `EmployeeShift`/`Shift`/`ShiftTiming`
- Performance — merging is O(n) per employee, negligible at the row scale of an attendance system

## Reversibility

If anyone wants the old behavior back: set `punch_merge_window_min = 0`.
The schedule-aware classification falls back to "no schedule" for
employees without an assigned shift, so it doesn't break legacy
deployments either.
