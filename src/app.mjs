import express from 'express';
import {mountAdmin} from './admin.mjs';
import {mountAccount} from './account.mjs';
import {mountOAuthRoutes} from './oauth-routes.mjs';
import {mountTestRoutes} from './test-routes.mjs';

export function createApp({db, oauth, rateLimit, expressFactory = express}) {
  const app = expressFactory();
  if (app.disable) app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  app.use(express.urlencoded({extended: false, limit: '32kb'}));
  app.use(express.json({limit: '32kb'}));
  app.use(rateLimit({db, windowMs: 60000, max: 300}));
  mountAdmin(app, db); mountAccount(app, db);
  mountOAuthRoutes(app, {db, oauth, rateLimit});
  if (process.env.ENABLE_TEST_ROUTES === 'true' && process.env.NODE_ENV !== 'production') mountTestRoutes(app, {db, oauth});
  app.get('/.well-known/oauth-authorization-server', (req, res) => res.json({issuer: process.env.OAUTH_ISSUER || `http://${req.headers.host}`, authorization_endpoint: '/oauth/authorize', token_endpoint: '/oauth/token', response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'] }));
  app.get('/health', (_, res) => res.json({ok: true}));
  return app;
}
