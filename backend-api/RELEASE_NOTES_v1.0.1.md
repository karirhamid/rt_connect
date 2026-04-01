# Release v1.0.1

Date: 2025-12-06

### Summary
Fixes a server-side session expiry issue that caused `DetachedInstanceError` in the auth endpoints. This caused some browser clients to see CORS-related errors because a 500 response lacked expected CORS headers.

### Fixes
- Set `expire_on_commit=False` for the SQLAlchemy `SessionLocal` to prevent ORM instances from being expired after commits and avoid DetachedInstanceError when returning simple attributes.
- Bumped API version to `1.0.1`.
- Added `CHANGELOG.md` and a basic integration test for the auth flow.

### Notes for release
- Tag: `v1.0.1` (already present in the repo)
- Suggested steps to publish release on GitHub (locally with GitHub CLI):

```powershell
# Create a release draft from tag
gh release create v1.0.1 --title "v1.0.1" --notes-file RELEASE_NOTES_v1.0.1.md --draft
# Or publish immediately
gh release create v1.0.1 --title "v1.0.1" --notes-file RELEASE_NOTES_v1.0.1.md
```

If you don't have `gh` configured, open the file and copy the contents into GitHub's "Create a new release" UI.
