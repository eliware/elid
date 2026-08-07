# Release Notes

## 1.0.6

### Changed

- Updated `@eliware/snowflake` from `^1.1.3` to `^1.1.4`.
- Refreshed the lockfile for the published Snowflake 1.1.4 package, removing obsolete transitive dependencies.
- Moved the container CI workflow to the Kubernetes container runner.

### Verification

- Jest tests pass: 71 tests across 11 suites.
- Syntax checks pass.
- Oxlint passes with zero warnings and zero errors.
- Local smoke test passed for health, OAuth metadata, OpenID metadata, and JWKS endpoints.

## 1.0.5

### Changed

- Improved application factory and OAuth route handling coverage.
- Cleaned up unused OAuth configuration helpers and lint issues.

### Testing

- Added comprehensive tests for account, admin, application, OAuth, OAuth routes, OIDC keys, rate limiting, Snowflake configuration, and test routes.
- Expanded targeted coverage across the Elid service, including edge cases and error paths.
- Lint now completes with zero warnings and zero errors.

## 1.0.4

### Added

- Added `@eliware/snowflake` as the shared Snowflake ID implementation.
- Added configurable worker and process identity through environment variables:
  - `SNOWFLAKE_WORKER_ID` / `WORKER_ID`
  - `SNOWFLAKE_PROCESS_ID` / `PROCESS_ID`
- Added stable identity mapping for Kubernetes pod names and other string identifiers.
- Added the `test:gaps` coverage helper command.

### Changed

- Replaced Elid's local Snowflake generator with the shared Eliware generator.
- Preserved decimal-string IDs for MySQL compatibility.
- Standardized package formatting and dependency metadata.
- Expanded Snowflake tests for the shared generator integration.

### Verification

- Jest tests pass.
- Snowflake generation remains compatible with existing `VARCHAR(32)` ID columns.
- Existing database IDs were migrated to the shared generator format without collisions.
