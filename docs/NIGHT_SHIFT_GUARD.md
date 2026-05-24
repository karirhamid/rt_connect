# Night Shift / Guard ("La Garde") + Holiday Duty — Design Notes

Status: **planned, not yet integrated.** This file captures the client's
requirements so we can build it cleanly later. A first partial fix is already
in place: the Today page "absent" count now respects each employee's weekly
day-off schedule (see "Already done" below).

## Client requirement (verbatim intent)

- Most employees work a **normal daily timing**, every day **except** the days
  marked as *day off* / *not working* in their own timing (weekly schedule).
  → Example: Sunday is a day off for nearly everyone, so on Sunday they must
    **not** be counted as absent.
- Some employees work the **night shift / guard ("la garde")**. They work at
  night (and/or on days that are otherwise non-working for everyone else).
- On **public holidays (jours fériés)**, **nobody works** **except** the
  specific employee(s) selected to be on duty ("la garde") for that day.
- So we need to be able to **assign specific employees to work on a given
  day** (a holiday or any otherwise-off day), and to mark certain employees as
  night/guard workers.

## Concepts to model

1. **Weekly schedule (exists today)** — `employee_schedules` /
   `department_schedules`, one row per `day_of_week` (0=Mon..6=Sun) with
   `is_day_off`. This already says "does this person normally work this
   weekday?".

2. **Holidays (exists today)** — `holidays` table (`shift_schema.py`,
   `HolidayType`). On a holiday, the default is **nobody works**.

3. **Guard / night shift (to add)** — a way to flag employees (or a shift of
   type `guard`/`night`, which already exist in `ShiftType`) who:
   - work night hours, and/or
   - work on days that are non-working for the general population
     (weekends/holidays).

4. **Per-day duty assignment (to add)** — "for *this* holiday/day, these
   employees are on duty." A small table like:
   ```
   duty_assignments(
     id, employee_id, duty_date, shift_id (optional, guard/night),
     reason/note, created_by, created_at
   )
   ```
   This drives both who is expected and how their punches are classified.

## "Expected to work today" — target logic (to finalize)

For a given date D and employee E, E is **expected** to work when:

```
if D is a public holiday:
    expected = E has a duty_assignment for D            (only la garde works)
elif E.weekly_schedule[D.weekday].is_day_off:
    expected = E has a duty_assignment for D            (guard covering an off day)
else:
    expected = True                                     (normal working day)
```

Night-shift nuance: a guard who starts at 22:00 and ends 06:00 crosses
midnight — their punches belong to the **shift date**, not the calendar date.
This affects which day a punch counts toward and the absent calculation around
midnight. Decide a rule (e.g. punches before NN:NN belong to the previous
day's night shift) when we build it.

## Absent calculation

`absent (for date D) = (# employees expected to work D) − (# who punched for D)`

- Today this counts weekly day-off only (see "Already done").
- Later: subtract holiday non-workers, then add back duty-assigned guards;
  attribute night-shift punches to the correct day.

## UI to add later

- Employee flag / shift assignment: "night shift / guard" (ShiftType already
  has `night` and `guard`).
- A calendar/picker to assign **who is on duty** for a specific holiday or
  off-day.
- Today page: a small "En garde / nuit" section or badge so guards aren't
  shown as absent and are visibly on-duty.
- Reports: guards counted correctly; holiday rows show only the on-duty staff.

## Already done (first fix)

- `GET /api/attendance/expected-working?target_date=YYYY-MM-DD` returns the
  count of employees expected to work that day based on the **weekly schedule**
  (`employee_schedules`, with `department_schedules` fallback; no schedule =
  assumed working). Deduped by matricule in shared mode.
- The Today page computes `absent = max(0, expected_working − present)`, so
  employees whose timing marks the day as off (e.g. Sunday) are **no longer
  counted absent**.
- NOT yet handled here: holidays, guard/night duty, per-day duty assignment,
  midnight-crossing night shifts. Those are the next phase described above.
