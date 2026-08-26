import express from 'express';
import {mountAdmin} from './admin.mjs';
import {mountAccount} from './account.mjs';
import {mountOAuthRoutes} from './oauth-routes.mjs';
import {mountTestRoutes} from './test-routes.mjs';
import {envNumber} from './rate-limit.mjs';
import {authorityOrigin} from './authority.mjs';

export function createApp({db, oauth, rateLimit, expressFactory = express}) {
  const app = expressFactory();
  if (app.disable) app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  app.use(express.urlencoded({extended: false, limit: '32kb'}));
  app.use(express.json({limit: '32kb'}));
  app.use((req, res, next) => {
    if (req.method !== 'POST' || req.path.startsWith('/oauth/token') || req.path.startsWith('/oauth/introspect') || req.path.startsWith('/oauth/register')) return next();
    const origin = req.get?.('origin');
    const host = req.get?.('host');
    if (origin && host && origin !== `https://${host}` && !(process.env.NODE_ENV !== 'production' && origin === `http://${host}`)) return res.status(403).send('Invalid request origin');
    next();
  });
  app.use(rateLimit({db, windowMs: envNumber('GLOBAL_RATE_WINDOW_MS', 60000), max: envNumber('GLOBAL_RATE_MAX', 1000)}));
  mountAdmin(app, db); mountAccount(app, db);
  mountOAuthRoutes(app, {db, oauth, rateLimit});
  if (process.env.ENABLE_TEST_ROUTES === 'true' && process.env.NODE_ENV !== 'production') mountTestRoutes(app, {db, oauth});
  app.get('/.well-known/openid-configuration', (req, res) => {
    const issuer=authorityOrigin(req);
    res.json({issuer,authorization_endpoint:`${issuer}/oauth/authorize`,token_endpoint:`${issuer}/oauth/token`,userinfo_endpoint:`${issuer}/userinfo`,jwks_uri:`${issuer}/.well-known/jwks.json`,response_types_supported:['code'],subject_types_supported:['public'],id_token_signing_alg_values_supported:['RS256'],scopes_supported:(process.env.OAUTH_SCOPES||'openid profile email groups funnel:read funnel:write').split(/\s+/).filter(Boolean),claims_supported:['iss','sub','aud','exp','iat','auth_time','preferred_username','name','email','email_verified','groups']});
  });
  app.get('/.well-known/jwks.json', async (_, res) => {
    try { const {loadVerificationKeys, publicJwk}=await import('./oidc-keys.mjs'); res.json({keys:(await loadVerificationKeys()).map(publicJwk)}); }
    catch { res.status(503).json({error:'signing_keys_unavailable'}); }
  });
  app.get('/.well-known/oauth-authorization-server', (req, res) => {
    const issuer = authorityOrigin(req);
    const metadata = {issuer, authorization_endpoint:`${issuer}/oauth/authorize`, token_endpoint:`${issuer}/oauth/token`, introspection_endpoint:`${issuer}/oauth/introspect`, registration_endpoint:`${issuer}/oauth/register`, response_types_supported:['code'], grant_types_supported:['authorization_code','refresh_token'], code_challenge_methods_supported:['S256'], scopes_supported:(process.env.OAUTH_SCOPES || 'funnel:read funnel:write').split(/\s+/).filter(Boolean), request_parameter_supported:true, resource_indicators_supported:true};
    res.json(metadata);
  });
  app.get('/health', (_, res) => res.json({ok: true}));
  return app;
}
