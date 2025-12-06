# Changelog

All notable changes to this project will be documented in this file.

## [1.0.1] - 2025-12-06
### Fixed
- Prevent DetachedInstanceError in auth endpoints by setting `expire_on_commit=False` on the SQLAlchemy `SessionLocal`.
- Ensure `/api/auth/me` returns proper responses (no 500) so CORS headers are included for browser clients.

### Changed
- Bumped API version to `1.0.1` in `app/core/config.py`.

