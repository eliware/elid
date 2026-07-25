# Elid OAuth Provider Specification

## Purpose
Provide a MySQL-backed, load-balancable OAuth authorization service and account-management UI.

## OAuth
- Authorization Code flow only.
- PKCE is mandatory and only `S256` is accepted.
- Redirect URIs must exactly match a registered client URI.
- Access tokens are opaque, random, database-backed bearer credentials.
- Refresh tokens rotate on every use; consumed tokens are revoked.
- Expired, used, and revoked credentials are rejected.
- OAuth metadata is served at `/.well-known/oauth-authorization-server`.
- Token introspection is available at `/oauth/introspect`.

## Identity and UI
- `/oauth/authorize` provides the branded login/authorization screen.
- `/account/login` provides user account login.
- `/account` allows password changes and application de-authorization.
- `/admin/login` and `/admin` provide root-only user/client administration.
- Passwords use bcrypt; minimum newly assigned password length is 12 characters.
- Root cannot be removed through the admin UI.

## Stateless deployment
- Admin sessions, account sessions, and PKCE flow state are stored in MySQL.
- Rate-limit buckets are stored in MySQL.
- No in-memory state may be required for correctness.
- app1 and app2 must use the same database and compatible environment configuration.
- HAProxy must route `auth.purinton.us` to app1/app2 port 8080.

## Database
- All application ID number fields use Snowflake IDs stored as `VARCHAR(32)`.
- OAuth users, clients, codes, tokens, sessions, PKCE flows, and rate limits are schema-managed in `db/schema.sql`.
- Secrets are stored as hashes where applicable.

## Security
- Do not expose token values in normal UI output or logs.
- Use secure cookie flags: `HttpOnly`, `SameSite=Strict`, scoped paths, and expiration.
- Apply global and endpoint-specific rate limits with HTTP 429 responses.
- Enforce request body size limits.
- Validate all client IDs, redirect URIs, grant types, and PKCE values.
- Use HTTPS in production via HAProxy.
