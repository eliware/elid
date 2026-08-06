# Release Notes

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
