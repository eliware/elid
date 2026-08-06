import {jest} from '@jest/globals';

const mounts = {
  admin: jest.fn(), account: jest.fn(), oauth: jest.fn(), test: jest.fn(),
};

jest.unstable_mockModule('../src/admin.mjs', () => ({mountAdmin: mounts.admin}));
jest.unstable_mockModule('../src/account.mjs', () => ({mountAccount: mounts.account}));
jest.unstable_mockModule('../src/oauth-routes.mjs', () => ({mountOAuthRoutes: mounts.oauth}));
jest.unstable_mockModule('../src/test-routes.mjs', () => ({mountTestRoutes: mounts.test}));
jest.unstable_mockModule('../src/oidc-keys.mjs', () => ({
  loadVerificationKeys: jest.fn(async () => [{publicKey: 'key', kid: 'kid', algorithm: 'RS256'}]),
  publicJwk: jest.fn(key => ({kid: key.kid})),
}));

const {createApp} = await import('../src/app.mjs');

function makeApp({disable = true} = {}) {
  const routes = new Map();
  const app = {
    ...(disable ? {disable: jest.fn()} : {}),
    set: jest.fn(),
    use: jest.fn(),
    get: jest.fn((path, handler) => routes.set(path, handler)),
  };
  return {app, routes};
}
const response = () => ({json: jest.fn(function (value) { this.value = value; return this; }), status: jest.fn(function (code) { this.code = code; return this; })});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.TRUST_PROXY;
  delete process.env.ENABLE_TEST_ROUTES;
  delete process.env.NODE_ENV;
  delete process.env.OAUTH_ISSUER;
  delete process.env.OAUTH_SCOPES;
});

test('factory configures middleware and optional test routes', () => {
  process.env.TRUST_PROXY = 'true';
  process.env.ENABLE_TEST_ROUTES = 'true';
  process.env.NODE_ENV = 'development';
  process.env.GLOBAL_RATE_WINDOW_MS = 'bad';
  process.env.GLOBAL_RATE_MAX = '25';
  const {app} = makeApp();
  const limiter = jest.fn(() => 'limiter');
  expect(createApp({db: 'db', oauth: 'oauth', rateLimit: limiter, expressFactory: () => app})).toBe(app);
  expect(app.disable).toHaveBeenCalledWith('x-powered-by');
  expect(app.set).toHaveBeenCalledWith('trust proxy', 1);
  expect(limiter).toHaveBeenCalledWith({db: 'db', windowMs: 60000, max: 25});
  expect(app.use).toHaveBeenCalledTimes(3);
  expect(mounts.admin).toHaveBeenCalledWith(app, 'db');
  expect(mounts.account).toHaveBeenCalledWith(app, 'db');
  expect(mounts.oauth).toHaveBeenCalledWith(app, {db: 'db', oauth: 'oauth', rateLimit: limiter});
  expect(mounts.test).toHaveBeenCalledWith(app, {db: 'db', oauth: 'oauth'});
});

test('factory uses default express and skips test routes when disabled', () => {
  const app = createApp({db: {}, oauth: {}, rateLimit: jest.fn(() => () => {})});
  expect(typeof app.use).toBe('function');
});

test('factory handles absent disable and production test-route guard', () => {
  process.env.ENABLE_TEST_ROUTES = 'true';
  process.env.NODE_ENV = 'production';
  const {app} = makeApp({disable: false});
  createApp({db: {}, oauth: {}, rateLimit: jest.fn(() => 'x'), expressFactory: () => app});
  expect(app.set).not.toHaveBeenCalled();
  expect(mounts.test).not.toHaveBeenCalled();
  delete process.env.ENABLE_TEST_ROUTES;
  const second = makeApp({disable: false});
  createApp({db: {}, oauth: {}, rateLimit: jest.fn(() => 'x'), expressFactory: () => second.app});
  expect(mounts.test).not.toHaveBeenCalled();
});

test('serves OIDC metadata with configured and derived issuer', async () => {
  process.env.OAUTH_ISSUER = 'https://issuer.example';
  process.env.OAUTH_SCOPES = 'one  two';
  let made = makeApp();
  createApp({db: {}, oauth: {}, rateLimit: jest.fn(() => 'x'), expressFactory: () => made.app});
  let res = response();
  await made.routes.get('/.well-known/openid-configuration')({protocol: 'http', headers: {host: 'fallback'}, get: jest.fn()}, res);
  expect(res.value.issuer).toBe('https://issuer.example');
  expect(res.value.scopes_supported).toEqual(['one', 'two']);

  delete process.env.OAUTH_ISSUER;
  made = makeApp();
  createApp({db: {}, oauth: {}, rateLimit: jest.fn(() => 'x'), expressFactory: () => made.app});
  res = response();
  await made.routes.get('/.well-known/openid-configuration')({protocol: 'http', headers: {host: 'fallback'}}, res);
  expect(res.value.issuer).toBe('http://fallback');
  delete process.env.OAUTH_SCOPES;
  res = response();
  await made.routes.get('/.well-known/openid-configuration')({protocol: 'http', headers: {host: 'fallback'}, get: undefined}, res);
  expect(res.value.scopes_supported).toContain('openid');
});

test('serves JWKS success and unavailable responses', async () => {
  const {app, routes} = makeApp();
  createApp({db: {}, oauth: {}, rateLimit: jest.fn(() => 'x'), expressFactory: () => app});
  let res = response();
  await routes.get('/.well-known/jwks.json')({}, res);
  expect(res.value).toEqual({keys: [{kid: 'kid'}]});

  const keys = await import('../src/oidc-keys.mjs');
  keys.loadVerificationKeys.mockRejectedValueOnce(new Error('no keys'));
  res = response();
  await routes.get('/.well-known/jwks.json')({}, res);
  expect(res.code).toBe(503);
  expect(res.value).toEqual({error: 'signing_keys_unavailable'});
});

test('serves OAuth metadata and health', () => {
  process.env.OAUTH_ISSUER = 'https://issuer.example';
  process.env.OAUTH_SCOPES = '';
  const {app, routes} = makeApp();
  createApp({db: {}, oauth: {}, rateLimit: jest.fn(() => 'x'), expressFactory: () => app});
  const res = response();
  routes.get('/.well-known/oauth-authorization-server')({headers: {}, get: undefined}, res);
  expect(res.value.registration_endpoint).toBe('https://issuer.example/oauth/register');
  process.env.OAUTH_ISSUER = '';
  delete process.env.OAUTH_SCOPES;
  const fallback = response();
  routes.get('/.well-known/oauth-authorization-server')({protocol: 'http', headers: {host: 'fallback'}, get: jest.fn(() => 'reported')}, fallback);
  expect(fallback.value.issuer).toBe('http://reported');
  const fallback2 = response();
  routes.get('/.well-known/oauth-authorization-server')({protocol: 'http', headers: {host: 'fallback'}, get: undefined}, fallback2);
  expect(fallback2.value.issuer).toBe('http://fallback');
  routes.get('/health')({}, res);
  expect(res.value.ok).toBe(true);
});
