# Elid OAuth Provider Specification

## Purpose

Provide a MySQL-backed, load-balancable OAuth 2.1-style authorization service and account-management UI.

Elid is the OAuth Authorization Server. Protected applications, including Funnel MCP, remain responsible for resource-server authentication and authorization on their own endpoints.

## OAuth

- Authorization Code flow only.
- PKCE is mandatory; only `S256` is accepted.
- Redirect URIs must exactly match a registered client URI.
- Access tokens are opaque, random, database-backed bearer credentials.
- Refresh tokens rotate on every use; consumed tokens are revoked.
- Expired, used, and revoked credentials are rejected.
- OAuth metadata is served at `/.well-known/oauth-authorization-server`.
- Token introspection is available at `/oauth/introspect`.
- OAuth errors use standard error names and HTTP status codes.

## MCP resource authorization

Elid must support OAuth Resource Indicators (RFC 8707) for MCP clients.

Canonical Funnel resource:

    https://funnel.purinton.us/mcp

The value must be treated as an exact identifier. Do not normalize it differently between authorization, token, refresh, introspection, or resource-server validation.

Required behavior:

- Accept `resource` in authorization requests.
- Accept `resource` in authorization-code token requests.
- Require the same resource in both requests for MCP-issued tokens.
- Preserve the resource on authorization codes.
- Bind issued access and refresh tokens to the resource.
- Preserve resource binding during refresh.
- Reject unsupported, unregistered, malformed, or conflicting resources.
- In production, resource identifiers must be absolute HTTPS URIs without fragments.
- Do not allow an MCP-bound token to authenticate another resource.

Existing non-MCP clients may continue using unbound tokens only where explicitly supported. They must never be accepted by Funnel's MCP endpoint.

## Scope policy

Scopes are space-delimited strings. Elid must enforce an allowlist per OAuth client.

Funnel scopes:

- `funnel:read` - read, search, and summarize Funnel jobs.
- `funnel:write` - modify approved Funnel job state.
- `funnel:admin` - reserved; must not be issued for the MVP.

Required behavior:

- Reject unknown scopes.
- Reject scopes not allowed for the client.
- Never grant scopes that were not requested.
- Store the granted scope set on authorization codes and tokens.
- Return granted scopes in token responses and introspection.
- Clients must not use the existing browser-dashboard client for MCP.
- Funnel must enforce scopes independently for every protected tool request.

Initial dedicated client:

    client_id: funnel-mcp
    public_client: true
    allowed_scopes: funnel:read funnel:write
    allowed_resources: https://funnel.purinton.us/mcp

## Token introspection

`POST /oauth/introspect` accepts an opaque token and returns no token value.

For an active access token, return at least:

- `active`
- `client_id`
- `sub` and/or `user_id`
- `scope`
- `resource`
- `aud` equivalent to the bound resource
- `iss` equal to the configured issuer
- `exp`
- `iat` when available
- `token_type`

When `resource` is supplied to introspection:

- Return inactive, or an equivalent clear audience error, if the token is not bound to that resource.
- Never report a token as usable for the wrong resource.

The introspection endpoint must be protected for resource-server use. Prefer confidential client authentication or a separate authenticated internal channel. Funnel must not authenticate introspection using the user's access token.

Do not log access tokens, refresh tokens, authorization codes, passwords, client secrets, or session cookies.

## Authorization-server metadata

`/.well-known/oauth-authorization-server` must be stable, cacheable, identical across app1/app2, and contain absolute HTTPS endpoint URLs in production.

It must advertise only implemented capabilities. For MCP support it should include:

    {
      "issuer": "https://auth.purinton.us",
      "authorization_endpoint": "https://auth.purinton.us/oauth/authorize",
      "token_endpoint": "https://auth.purinton.us/oauth/token",
      "introspection_endpoint": "https://auth.purinton.us/oauth/introspect",
      "registration_endpoint": "https://auth.purinton.us/oauth/register",
      "response_types_supported": ["code"],
      "grant_types_supported": ["authorization_code", "refresh_token"],
      "code_challenge_methods_supported": ["S256"],
      "scopes_supported": ["funnel:read", "funnel:write"],
      "request_parameter_supported": true,
      "resource_indicators_supported": true
    }

Dynamic Client Registration is implemented at `POST /oauth/register` and must be advertised as `registration_endpoint`.

## Protected Resource Metadata

Elid is not required to host Funnel's Protected Resource Metadata (RFC 9728). Funnel must publish metadata for its own MCP resource, including:

    {
      "resource": "https://funnel.purinton.us/mcp",
      "authorization_servers": ["https://auth.purinton.us"],
      "scopes_supported": ["funnel:read", "funnel:write"]
    }

Funnel must return HTTP 401 with a suitable `WWW-Authenticate` challenge for missing or invalid bearer credentials. Elid should document the issuer and resource values Funnel must publish.

## Authorization and consent UI

`/oauth/authorize` provides the branded login/authorization screen.

The consent page must show:

- Client/application name.
- Requested scopes in human-readable language.
- Target resource name and URI.
- What read and write access permits.

The user must be able to approve or deny. Elid must not silently grant unrequested scopes. `funnel:write` should be clearly displayed and require explicit consent.

## Dynamic Client Registration

`POST /oauth/register` implements RFC 7591 for public MCP clients, so VS Code can register without manual client setup. Registration is public and must not require an admin login.

Accept JSON metadata including:

- `client_name`
- `redirect_uris`
- `token_endpoint_auth_method`
- `grant_types`
- `response_types`
- `scope`
- optionally, a resource policy field

For public PKCE clients, support `token_endpoint_auth_method: "none"`, `grant_types: ["authorization_code"]`, `response_types: ["code"]`, and `code_challenge_methods_supported: ["S256"]`. Do not issue a client secret.

Return HTTP 201 JSON containing at least `client_id`, the accepted client metadata, and `client_id_issued_at`.

- Require HTTPS redirect URIs, except explicit localhost development URIs.
- For Funnel MCP, permit `http://127.0.0.1:33418` and `https://vscode.dev/redirect`; preserve the exact supplied list.
- Never wildcard-match or loosely normalize redirect URIs.
- Validate redirect URI count, length, scheme, and all requested registration capabilities.
- Apply request-size limits, rate limiting, and abuse controls.
- Generate server-controlled client IDs; prevent attacker-controlled duplicates.
- Store registration metadata in MySQL and retain revocation/audit records.
- Allow administrators to revoke dynamic registrations.

Dynamic clients targeting Funnel are constrained to resource `https://funnel.purinton.us/mcp`, default to `funnel:read`, may request `funnel:write`, and must never receive `funnel:admin`. Resource, scope, consent, exact redirect, and S256 PKCE checks remain mandatory during authorization and token issuance. The existing pre-registered `funnel-mcp` client remains separate and unchanged.

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
- No in-memory state may be required for OAuth correctness.
- app1 and app2 must use the same database and compatible environment configuration.
- HAProxy must route `auth.purinton.us` to app1/app2 port 8080.

MCP transport statelessness is separate from OAuth state:

- Elid does not issue or track MCP transport-session IDs.
- Elid does not need MCP conversation state.
- OAuth authorization codes, tokens, refresh families, sessions, and rate limits remain persistent and database-backed.
- Funnel must authenticate every MCP HTTP request independently.

## Database

- All application ID number fields use Snowflake IDs stored as `VARCHAR(32)`.
- OAuth users, clients, codes, tokens, sessions, PKCE flows, and rate limits are schema-managed in `db/schema.sql`.
- Secrets are stored as hashes where applicable.
- Client scope and resource policies must be persisted and migration-safe.
- Authorization codes and tokens must persist granted scopes and resource binding.
- Existing tokens without a resource must not be accepted at Funnel MCP.

## Refresh tokens

- Preserve current rotation behavior.
- Preserve user, client, granted scopes, and resource binding on refresh.
- Reject a conflicting refresh `resource`.
- Revoke the old refresh token.
- Invalidate the complete token family on reuse detection.
- Return resource only if supported by the selected token response contract.

## Security

- Preserve mandatory PKCE S256 validation.
- Preserve exact redirect URI validation.
- Use HTTPS in production.
- Use short-lived access tokens.
- Use secure cookies: `HttpOnly`, `SameSite=Strict`, scoped paths, and expiration.
- Apply global and endpoint-specific rate limits with HTTP 429 responses.
- Enforce request body size limits.
- Validate client IDs, redirect URIs, grant types, scope values, resources, and PKCE values.
- Use parameterized SQL.
- Do not expose token values in normal UI output or logs.
- Do not accept browser cookies as MCP bearer authentication.
- Do not issue universal static bearer tokens.

Expected errors:

- Missing/malformed/expired/revoked bearer token: HTTP 401.
- Wrong resource/audience: HTTP 401.
- Missing scope: HTTP 403.
- Unknown or unauthorized scope: HTTP 400.
- Invalid resource: HTTP 400.
- Invalid client, redirect URI, authorization code, or PKCE: standard OAuth HTTP 400 response.

## Acceptance tests

Elid must test:

- Valid Funnel resource authorization succeeds.
- Missing or wrong resource is rejected.
- Authorization-code resource cannot change during token exchange.
- Unknown scope is rejected.
- Client-disallowed scope is rejected.
- Only requested scopes are granted.
- Introspection returns resource/audience, issuer, subject, scopes, expiry, issue time, and client.
- Introspection with the wrong resource does not report the token active/usable.
- Expired and revoked tokens are inactive.
- Refresh preserves resource and scopes.
- Refresh-token reuse invalidates the family.
- PKCE S256 remains mandatory.
- Exact redirect matching remains mandatory.
- Metadata advertises implemented MCP capabilities.
- No credentials appear in logs.
- Existing browser OAuth login still works.
- Existing non-MCP clients are not accidentally granted MCP access.

## Scope of MCP transport

Funnel owns the MCP server and transport. Elid only provides OAuth authorization.

Funnel is responsible for:

- `/mcp` bearer authentication.
- Protected Resource Metadata.
- Resource and scope checks on every request/tool call.
- Stateless Streamable HTTP transport where supported.
- Compatibility with older stateful MCP clients where required.

The 2026-07-28 MCP direction removes protocol-level transport sessions. Elid changes must remain valid for both stateless modern clients and legacy clients that negotiate the earlier session-based protocol.
