# Elid requirements for Kubernetes platform SSO

Prepared August 4, 2026.

## Goal

Integrate Elid with Argo CD at:

- Argo URL: `https://argo.purinton.us`
- Preferred flow: standard OIDC Authorization Code flow
- Argo callback: `https://argo.purinton.us/api/dex/callback` if using Dex, or Argo's OIDC callback if direct OIDC is implemented

## Required developer work

Please confirm whether Elid will implement full OIDC. Preferred implementation:

1. Add OIDC discovery:
   - `GET /.well-known/openid-configuration`
2. Add an ID-token-capable authorization-code flow.
3. Add JWKS:
   - `GET /.well-known/jwks.json`
4. Add a `userinfo` endpoint:
   - `GET /userinfo`
   - bearer access token required
5. Add ID-token claims:
   - `iss`
   - `sub` (stable, never reused)
   - `aud`
   - `exp`
   - `iat`
   - `auth_time` if supported
   - `name` or `preferred_username`
   - `email`
   - `email_verified`
   - `groups` if group-based authorization is supported
6. Sign ID tokens with rotating asymmetric keys, preferably RS256 or ES256.
7. Publish active signing keys through JWKS with stable `kid` values.
8. Support exact redirect URI registration and PKCE S256.
9. Ensure issuer and endpoint URLs are absolute HTTPS URLs in production.

## Required OAuth client support

Elid must allow registering an Argo client with:

- Client type: confidential web application
- Redirect URI: `https://argo.purinton.us/api/dex/callback`
- Grant: authorization code
- Scopes: `openid profile email groups`
- Client authentication: client secret at the token endpoint

Return/store the client ID and secret securely. Do not log either value.

## Group/RBAC requirements

Argo needs a reliable claim for role mapping. Preferred claim:

```json
"groups": ["kubernetes-admins", "kubernetes-users"]
```

The groups claim must be present in the ID token or available through `userinfo`. Document how Elid administrators assign users to groups.

Initial intended mapping:

- `kubernetes-admins` -> Argo `role:admin`
- `kubernetes-users` -> Argo read-only role

## If full OIDC is not implemented

Provide a Dex-compatible OAuth connector contract instead:

- authorization endpoint
- token endpoint
- user/profile endpoint
- client authentication method
- user ID field
- email field
- display-name field
- groups field
- documented scopes
- documented JSON response examples

The profile endpoint must accept a bearer access token and return a stable user identifier. OAuth metadata alone is insufficient for Argo SSO.

## Security requirements

- No implicit grant.
- Authorization code + PKCE S256.
- Exact redirect URI matching.
- Short-lived access and ID tokens.
- Refresh-token rotation and reuse invalidation.
- Key rotation without invalidating active tokens unexpectedly.
- No tokens, passwords, client secrets, or session cookies in logs.
- Rate-limit authorization, login, token, and userinfo endpoints.
- Validate `iss`, `aud`, `exp`, signature, and nonce where applicable.

## Acceptance tests

Provide curl/test instructions proving:

1. Discovery returns valid HTTPS URLs.
2. JWKS returns an active signing key.
3. Authorization redirects correctly.
4. Callback exchanges a code successfully.
5. ID token signature and claims validate.
6. Userinfo returns the expected stable identity.
7. Group claims are returned correctly.
8. Invalid redirect URIs are rejected.
9. PKCE S256 is enforced.
10. Expired, invalid, and wrong-audience tokens are rejected.

Do not configure Argo until these endpoints and claims are available and Elid is running behind HTTPS.


## Grafana SSO requirements

Grafana is deployed at:

- Grafana URL: `https://grafana.purinton.us`
- Preferred flow: OAuth 2.0 Authorization Code with PKCE S256; OIDC is preferred.

Required OAuth/OIDC support:

1. Dynamic client registration for Grafana.
2. Exact redirect URI:
   - `https://grafana.purinton.us/login/generic_oauth`
3. Authorization Code grant with PKCE S256.
4. Client authentication at the token endpoint.
5. A stable user identity field, preferably `sub`.
6. Email and display-name fields.
7. Group claims for Grafana role mapping, preferably `groups`.
8. A userinfo or equivalent profile endpoint accepting a bearer access token.

Current Elid metadata advertises:

- Authorization: `https://auth.purinton.us/oauth/authorize`
- Token: `https://auth.purinton.us/oauth/token`
- Dynamic registration: `https://auth.purinton.us/oauth/register`
- PKCE: S256

Current blocker: metadata does not advertise `openid`, ID tokens, JWKS, userinfo, or identity scopes. It currently advertises only `funnel:read` and `funnel:write`. Grafana SSO should not be configured until a stable profile response is documented.

Preferred Grafana claims:

```json
{
  "sub": "stable-user-id",
  "preferred_username": "rpurinton",
  "name": "Display Name",
  "email": "user@example.com",
  "email_verified": true,
  "groups": ["kubernetes-admins", "kubernetes-users"]
}
```

Initial Grafana role mapping:

- `kubernetes-admins` -> Grafana Administrator
- `kubernetes-users` -> Grafana Viewer or Editor, pending policy decision

Do not place OAuth client secrets in Git. Store them using SOPS/age and inject them through the GitOps secret workflow.

## Elid Kubernetes containerization requirements

Elid currently runs as a bare-metal VM application behind VyOS on `app1`/`app2`, using the existing `cluster1`/`cluster2`/`cluster3` MySQL service. Prepare the application for migration to this Kubernetes cluster.

The Elid developer should:

- Identify all application processes, ports, protocols, startup commands, and health checks.
- Provide a production container image definition (`Dockerfile` or equivalent) and pinned dependencies.
- Document required environment variables, files, certificates, storage, queues, cron jobs, and external services.
- Separate configuration and secrets from the image; identify each secret needed at runtime.
- Confirm MySQL version, databases, users, migrations, connection limits, TLS needs, and failover behavior.
- Determine whether the app is stateless; document uploads, sessions, caches, and persistent data requirements.
- Provide readiness/liveness/startup probes and graceful shutdown behavior.
- Document resource requests/limits and expected replica/scaling behavior.
- Define worker/background jobs and whether they require singleton scheduling.
- Explain current app1/app2 routing, deployment, rollback, and maintenance procedures.
- Identify DNS names and HTTP hostnames required after migration.

Provide the platform team with:

- Container image name and registry access requirements.
- Kubernetes manifests or Helm chart, preferably suitable for Argo CD GitOps.
- Non-secret ConfigMap values and SOPS-encrypted Secret inputs.
- Service, Gateway/HTTPRoute, and health-check requirements.
- Database migration and cutover plan from app1/app2.
- Backup, restore, observability, and rollback requirements.
- Acceptance tests proving the containerized app works against the existing MySQL service.

Do not migrate production traffic until the container image, manifests, secrets, database plan, health checks, rollback path, and app1/app2 fallback are tested.
