# Elid OAuth Provider

Node.js ESM-only OAuth 2.1-style authorization server backed by MySQL.

Features:
- Authorization Code + mandatory S256 PKCE
- Rotating refresh tokens with reuse invalidation
- Opaque database-backed access tokens
- OAuth authorization-server metadata
- User-password authorization UI
- Snowflake IDs stored as VARCHAR(32)

Setup:
```sh
mysql < db/schema.sql
npm start
```

Create users/clients directly in MySQL. Passwords must be bcrypt hashes; client redirect_uris is a JSON array.


Production configuration

Copy `.env.example` to `.env` and set real values. The app refuses to start without database configuration. Use HTTPS, `NODE_ENV=production`, and keep `ENABLE_TEST_ROUTES=false`. Test routes are available only when explicitly enabled outside production.

## Client registration CLI

Register a protected application from the Elid host after loading the production `.env`:

```sh
npm run client -- \
  --name "Docs Web" \
  --redirect-uri https://docs.purinton.us/auth/callback \
  --scope docs:read \
  --resource https://docs.purinton.us/
```

Repeat `--redirect-uri`, `--scope`, or `--resource` as needed. Public clients use PKCE and do not receive a secret. Add `--confidential` only for a server-side confidential client; the generated secret is printed once and must be stored securely.
