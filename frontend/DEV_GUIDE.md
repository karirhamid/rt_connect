# Developer Guide — Frontend (RT Connect)

This short guide explains how to safely make changes to the frontend and verify them without corrupting other parts of the project.

## Quick start (Windows PowerShell)

1. Activate Python venv for backend (if needed):

```powershell
& C:/Users/RTHOME/Desktop/rt_connect/venv/Scripts/Activate.ps1
```

2. Install JS dependencies and run dev server from `frontend`:

```powershell
cd frontend
npm install
npm run dev
```

3. Open the app in your browser: `http://localhost:5174` (Vite may pick another port, check terminal).

---

## Important files

- `src/main.jsx` — React entry
- `src/App.jsx` — Routing and navigation
- `src/pages/*` — Page components (Dashboard, Settings, Attendance, Devices, etc.)
- `src/services/api.js` — All API calls; change here only when updating endpoints
- `src/i18n.js` — All translations (FR/EN/AR)
- `package.json` — dev/build/lint scripts

---

## i18n notes

- All translations are centralized in `src/i18n.js`.
- Add keys to `fr`, `en`, and `ar` resources simultaneously to avoid missing translations.
- Use `useTranslation()` and `t('key')` in components.
- Arabic index uses RTL: `document.documentElement.dir = 'rtl'` is set where language is switched.

---

## Making safe changes

1. Create a branch for your change:

```powershell
git checkout -b feat/my-change
```

2. Make small, focused edits. Prefer changing one page or component at a time.

3. Run the app locally and test the exact flows and pages you modified.

4. If you change API calls, update `VITE_API_URL` to point to a staging/test backend or mock responses.

5. Run lint before committing:

```powershell
cd frontend
npm run lint
```

6. Commit and push:

```powershell
git add .
git commit -m "feat: short description"
git push -u origin feat/my-change
```

7. Open a PR and request a review. If possible, include screenshots or steps to reproduce verification.

---

## Verifying translations and RTL

- Change language from `Settings > General` and verify pages render translated strings.
- For Arabic, check layout direction (RTL) and ensure no clipping.

---

## Dashboard auto-refresh behavior

- The dashboard respects the `sync_enabled` setting (fetched from `GET /api/settings/general`).
- Disable `Synchronisation Automatique en Arrière-plan` in `Settings > General` to stop background refreshes.
- Manual refresh (`Refresh` button) still triggers a fetch regardless of the auto-sync setting.

---

## When in doubt

- Revert a local change and test incrementally.
- Use feature branches to isolate changes and avoid corrupting `main`.
- Ask for a code review before merging changes that affect shared behaviours (auth, i18n, API integrations).

---

If you want, I can:
- Add a pre-commit hook to run lint/build checks.
- Add automated unit/integration tests for critical pages.
- Create a checklist template for PR verification.

Tell me which of those you'd like me to add next.