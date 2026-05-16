# Night Shift / Garde Reporting — Design Proposal

> **Status:** Approved, not yet implemented. Pick up later.
> **Created during:** v2.2.x deployment work, after the user described
> their actual workflow with 19 employees split between fixed day shifts
> and on-call garde rotations.

---

## Problem statement

The current reporting buckets punches by calendar date, which breaks for
shifts that cross midnight (e.g. garde 19h → 07h next morning). A single
garde session shows up as two broken half-rows on two different dates, so
totals, entry, and exit are all wrong for night-shift employees. Day-shift
reporting works correctly and must not be impacted.

---

## Design decisions (confirmed with user)

| Decision | Choice |
|---|---|
| **Scheduling source** | Pre-assigned in the system (admin marks who is on garde each date). No auto-detection. |
| **Recovery day after garde** | None. Garde is paid extra; the employee still does normal day shifts the same/next day. |
| **Same-day day + night shifts allowed?** | Yes. Many garde employees also do a regular 08:00–16:00 day shift. |
| **Continuous-punch split (Edge case 2)** | Split at scheduled garde end time. If garde is 19:00 → 07:00, day shift 08:00 → 16:00, and the employee never clocks out, garde portion = 19:00 → 07:00 (11h with 1h break), day shift portion = 08:00 → 16:00 (8h). |
| **Garde date label** | Use the START date. "Garde du Samedi 19h → Dimanche 07h" shown in both Saturday's and Sunday's reports under the "Garde" section. |
| **Hours calculation** | Total elapsed Entry → Exit, minus scheduled break duration. Matches existing day-shift rule. |

---

## Reporting UI shape

Each calendar date D's report renders TWO sections:

```
═══ Pointages du 16/05/2026 (Samedi) ═══

┌── Shift normal ──────────────────────────────────────────────┐
│  Employé      Entrée   Sortie   Total   Statut               │
│  Ibrahim      08:02    16:05    7h 33m  ✓ Présent            │
│  Sara         08:15    17:00    8h 15m  ✓ Présent            │
│  …            (existing day-shift report, unchanged)         │
└──────────────────────────────────────────────────────────────┘

┌── Garde / Shift de nuit ─────────────────────────────────────┐
│  Employé   Date       Entrée    Sortie     Total   Statut    │
│  Ibrahim   Ven 15/05  19:05     Sam 07:00  11h 25m ✓         │
│  Hayat     Sam 16/05  19:00     —          —       En cours  │
└──────────────────────────────────────────────────────────────┘
```

- Section 2 is **hidden** for dates with no garde scheduled → existing
  reports look pixel-identical.

---

## Edge cases and their rules

| # | Situation | Rule |
|---|---|---|
| 1 | Garde ends, employee leaves, comes back for normal day. Punches: `Sat 19h IN → Sun 07h OUT → Sun 10h IN → Sun 16h OUT` | Two distinct sessions, two distinct rows. Clean. |
| 2 | Continuous punches across midnight: `Sat 19h IN → Sun 16h OUT` (no 07h clock-out) | Split at scheduled garde end. Garde row: 19h → 07h. Day-shift row: 07h → 16h. Day-shift row gets a "calculé selon planning" tooltip. |
| 3 | Garde scheduled, missing entry punch — only `Sun 07:30 OUT` | Garde row: Entry = "—", Exit = 07:30, Total = "?", flagged `incomplete`. |
| 4 | Garde scheduled, no punches at all | Garde row: Entry = "—", Exit = "—", Total = 0, status = "Absent garde". |

---

## What changes

### Database
**Zero schema changes.** Everything we need exists:
- `Shift` with `shift_type = NIGHT`
- `ShiftTiming.is_overnight = true`
- `EmployeeShift` to assign a night shift to specific employees on specific dates
- `DailyShiftRecord`, `ShiftException` already present

### Backend (`app/api/reports.py`)
- New helper `_garde_records(start_date, end_date, filters)` — builds the
  garde rows for a date range. For each date, find:
  - Garde sessions starting on D (from EmployeeShift records with overnight shift, start date = D)
  - Garde sessions ending on D (started D-1)
  - Pull punches in `[D-1 18:00, D+1 12:00]` for those employees
  - Build session rows with entry/exit/total
- New helper `_day_shift_records_excluding_garde(...)` — wraps existing
  day-shift query, strips punches that fall inside any garde window for
  that employee
- Continuous-punch split logic
- New endpoint `/api/reports/attendance-with-garde` returning:
  ```json
  {
    "day_shift": [ … existing day-shift row shape … ],
    "garde":     [ … new garde row shape … ]
  }
  ```
- Existing `/api/attendance/records` endpoint stays untouched

### Frontend (`pages/Reports.jsx`)
- New `<GardeSection>` component below the day-shift table
- Renders only when `garde.length > 0`
- Empty case → not rendered (preserves existing UX)

### PDF (`reports.py::export_attendance_pdf`)
- Adds second table when garde data exists for the date range
- Page break before "Garde" section if needed
- Same layout as the web view

### Shift Management UI
- Verify admins can create a Night shift and assign it to a specific
  employee on specific dates. If clunky, add a quick "Mark on garde for
  [date]" shortcut.

---

## Implementation phases

Each phase is a separate commit, individually shippable.

| Phase | Scope | Estimated effort | Risk to existing reports |
|---|---|---|---|
| **1. Backend algorithm + endpoint + tests** | `_garde_records`, `_day_shift_records_excluding_garde`, continuous-punch split, `/api/reports/attendance-with-garde`, unit tests for all 4 edge cases | 3–4 hours | Zero — new code path; old endpoint unchanged |
| **2. Frontend Reports page** | `<GardeSection>` component, conditional render | 2 hours | Zero — second table hidden if no garde |
| **3. PDF export** | Second table in `export_attendance_pdf` when garde present | 1 hour | Zero — same condition |
| **4. Shift Management UX check** | Verify garde assignment works, add shortcut if needed | 30 min | Zero |

---

## Open questions for implementation time

- [ ] Does `EmployeeShift` already support assigning a single date (vs only date ranges)? If not, add a single-day shortcut.
- [ ] Should the "calculé selon planning" tooltip in Edge Case 2 also surface in the PDF (as a footnote)?
- [ ] Where should the "Mark on garde for [date]" shortcut live — sidebar Shift Management, or a per-employee quick action on the Employees page?

---

## What does NOT change
- `/api/attendance/records` — same shape, same logic
- Existing day-shift reports (when no garde scheduled): pixel-identical
- Existing PDF reports (when no garde scheduled): pixel-identical
- Database schema
- Shift configuration UI (only verified, not redesigned)
