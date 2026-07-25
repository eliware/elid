# AGENTS.md

## Project
Elid is an ESM-only Node.js OAuth 2.1-style authorization provider backed by MySQL.

## Runtime
- Entry point: `server.mjs`
- Port: `HTTP_PORT` (default `8080`)
- Service: `elid.service`
- Database schema: `db/schema.sql`
- Modules: `src/*.mjs`

## Rules
- Use `.mjs` files and ESM imports/exports only. Never CommonJS.
- Keep all numeric IDs as Snowflake decimal strings stored in MySQL `VARCHAR(32)`.
- Use parameterized SQL. Never interpolate user input into SQL.
- Do not log passwords, tokens, authorization codes, or session cookies.
- Preserve PKCE S256 validation, redirect URI validation, token rotation, and token revocation.
- Keep sessions, PKCE state, and rate limits MySQL-backed so app1/app2 remain stateless.
- Do not deploy, sync, commit, tag, or push unless explicitly requested.
- Read `README.md`, `SPEC.md`, and relevant source/schema files before behavior changes.

## Verification
```sh
npm run check
mysql elid < db/schema.sql
systemctl restart elid.service
curl -fsS http://127.0.0.1:8080/health
```

For changes to OAuth flows, test `/test/login`, callback handling, account login, and admin login. Check logs with:
```sh
journalctl -u elid.service -n 50 --no-pager
```
