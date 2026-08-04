import express from 'express';
import {mountAdmin} from './admin.mjs';
import {mountAccount} from './account.mjs';
import {mountOAuthRoutes} from './oauth-routes.mjs';
import {mountTestRoutes} from './test-routes.mjs';
import {envNumber} from './rate-limit.mjs';

export function createApp({db, oauth, rateLimit, expressFactory = express}) {
  const app = expressFactory();
  if (app.disable) app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  app.use(express.urlencoded({extended: false, limit: '32kb'}));
  app.use(express.json({limit: '32kb'}));
  app.use(rateLimit({db, windowMs: envNumber('GLOBAL_RATE_WINDOW_MS', 60000), max: envNumber('GLOBAL_RATE_MAX', 1000)}));
  mountAdmin(app, db); mountAccount(app, db);
  mountOAuthRoutes(app, {db, oauth, rateLimit});
  if (process.env.ENABLE_TEST_ROUTES === 'true' && process.env.NODE_ENV !== 'production') mountTestRoutes(app, {db, oauth});
  app.get('/.well-known/openid-configuration', (req, res) => {
    const issuer=process.env.OAUTH_ISSUER || `${req.protocol}://${req.get?.('host')||req.headers.host}`;
    res.json({issuer,authorization_endpoint:`${issuer}/oauth/authorize`,token_endpoint:`${issuer}/oauth/token`,userinfo_endpoint:`${issuer}/userinfo`,jwks_uri:`${issuer}/.well-known/jwks.json`,response_types_supported:['code'],subject_types_supported:['public'],id_token_signing_alg_values_supported:['RS256'],scopes_supported:(process.env.OAUTH_SCOPES||'openid profile email groups funnel:read funnel:write').split(/\s+/).filter(Boolean),claims_supported:['iss','sub','aud','exp','iat','auth_time','preferred_username','name','email','email_verified','groups']});
  });
  app.get('/.well-known/jwks.json', async (_, res) => {
    try { const {loadVerificationKeys, publicJwk}=await import('./oidc-keys.mjs'); res.json({keys:(await loadVerificationKeys()).map(publicJwk)}); }
    catch { res.status(503).json({error:'signing_keys_unavailable'}); }
  });
  app.get('/.well-known/oauth-authorization-server', (req, res) => { const issuer=process.env.OAUTH_ISSUER || `${req.protocol}://${req.get?.('host')||req.headers.host}`; const metadata={issuer,authorization_endpoint:`${issuer}/oauth/authorize`,token_endpoint:`${issuer}/oauth/token`,introspection_endpoint:`${issuer}/oauth/introspect`,registration_endpoint:`${issuer}/oauth/register`,response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],scopes_supported:(process.env.OAUTH_SCOPES||'funnel:read funnel:write').split(/\s+/).filter(Boolean),request_parameter_supported:true,resource_indicators_supported:true}; console.info('oauth metadata request', {host:req.get?.('host')||req.headers.host, forwardedProto:req.headers['x-forwarded-proto']||null, issuer, registration_endpoint:metadata.registration_endpoint}); res.json(metadata); });
  app.get('/health', (_, res) => res.json({ok: true}));
  return app;
}
