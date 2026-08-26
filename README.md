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

Elid is reachable through all hostnames listed in `OAUTH_AUTHORITY_HOSTS`.
Metadata uses the requested allowlisted hostname, so clients can start from
`auth.purinton.us` or `auth.eliware.org` without being redirected to a
different authority. `OAUTH_ISSUER` remains the optional canonical issuer for
tokens and OIDC claims. Existing clients keep their exact registered redirect URIs.

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

## OIDC signing keys

Generate an RS256 signing-key set outside the repository:

```sh
OIDC_KEY_DIR=/var/lib/elid/keys npm run oidc:keys
# rotate while retaining the prior public key
OIDC_KEY_DIR=/var/lib/elid/keys npm run oidc:keys -- --rotate
```

Back up the encrypted key directory. Never commit private keys. The runtime expects `current-private.pem`, `current-public.pem`, and `current-kid`.

For local Compose testing, place a disposable key set in `.local-oidc-keys/`; it is ignored and mounted read-only. Production should use a Kubernetes Secret or protected host volume, not repository files.

## Operations and validation

The service requires MySQL and external OIDC signing keys. Run it behind HTTPS
with `TRUST_PROXY=true`. `/health` is a liveness endpoint and does not replace
database or key-readiness monitoring. Systemd uses `elid.service`; Compose is
provided for local validation. Back up MySQL using the organization's database
backup procedure and back up the encrypted OIDC key directory. Roll back by
restoring the previous application image or checkout and restarting the service;
do not roll back the database schema without reviewing migrations.

Local validation:

```sh
npm test
npm run lint
npm run typecheck
npm audit --omit=dev --audit-level=moderate
npm run pack
```
