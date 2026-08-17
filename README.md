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

Elid is reachable through both configured authority hostnames. Set
`OAUTH_ISSUER` to the canonical authority advertised in production; both
hostnames serve the same metadata, authorization, token, JWKS, and introspection
application. Existing clients keep their exact registered redirect URIs.

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
