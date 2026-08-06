import {jest, test, expect} from '@jest/globals';
import {mountTestRoutes} from '../src/test-routes.mjs';

const response = () => ({
  redirect: jest.fn(),
  send: jest.fn(),
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
});

const setup = ({dbExecute = jest.fn(), oauthToken = jest.fn()} = {}) => {
  const routes = new Map();
  const app = {get: jest.fn((path, handler) => routes.set(path, handler))};
  const db = {execute: dbExecute};
  const oauth = {token: oauthToken};
  mountTestRoutes(app, {db, oauth});
  return {routes, db, oauth};
};

test('mounts all test routes', () => {
  const {routes} = setup();
  expect([...routes.keys()]).toEqual(['/test/login', '/test/logout', '/test/callback']);
});

test('login stores PKCE flow and redirects using forwarded host/protocol', async () => {
  const execute = jest.fn().mockResolvedValue([]);
  const {routes} = setup({dbExecute: execute});
  const res = response();
  await routes.get('/test/login')({headers: {host: 'internal:8080'}, get: jest.fn().mockReturnValue('https')}, res);
  expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO oauth_pkce_flows'), expect.any(Array));
  expect(execute.mock.calls[0][1][2]).toBe('https://internal:8080/test/callback');
  expect(res.redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/oauth\/authorize\?/));
  expect(res.redirect.mock.calls[0][0]).toContain('code_challenge_method=S256');
});

test('login uses configured host and secure fallback', async () => {
  const execute = jest.fn().mockResolvedValue([]);
  const {routes} = setup({dbExecute: execute});
  const res = response();
  await routes.get('/test/login')({headers: {}, secure: true}, res);
  expect(execute.mock.calls[0][1][2]).toBe('https://undefined/test/callback');

  const configured = setup({dbExecute: jest.fn().mockResolvedValue([])});
  await configured.routes.get('/test/login')({headers: {host: 'ignored'}, secure: false}, response());
  const publicDb = jest.fn().mockResolvedValue([]);
  const publicApp = {get: (path, handler) => { if (path === '/test/login') publicApp.handler = handler; }};
  mountTestRoutes(publicApp, {db: {execute: publicDb}, oauth: {}, publicHost: 'public.example', clientId: 'custom'});
  await publicApp.handler({headers: {host: 'x'}, secure: false}, response());
  expect(publicDb.mock.calls[0][1][2]).toBe('http://public.example/test/callback');
});

test('logout renders sign-in link', () => {
  const {routes} = setup();
  const res = response();
  routes.get('/test/logout')({}, res);
  expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Logged out'));
});

test('callback rejects missing or expired flow and missing code', async () => {
  const execute = jest.fn().mockResolvedValue([[]]);
  const {routes} = setup({dbExecute: execute});
  const res = response();
  await routes.get('/test/callback')({query: {state: 'bad'}}, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.send).toHaveBeenCalledWith('Invalid or expired test login callback');

  const flow = {verifier: 'v', redirect_uri: 'http://x/callback'};
  execute.mockResolvedValueOnce([[flow]]).mockResolvedValueOnce([]);
  const res2 = response();
  await routes.get('/test/callback')({query: {state: 'state'}}, res2);
  expect(res2.status).toHaveBeenCalledWith(400);
});

test('callback returns OAuth errors', async () => {
  const execute = jest.fn().mockResolvedValueOnce([[{verifier: 'v', redirect_uri: 'http://x/callback'}]]).mockResolvedValueOnce([]).mockResolvedValueOnce([[]]);
  const {routes} = setup({dbExecute: execute, oauthToken: jest.fn().mockResolvedValue({error: 'invalid_grant'})});
  const res = response();
  await routes.get('/test/callback')({query: {state: 's', code: 'c'}}, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({error: 'invalid_grant'});
});

test('callback renders successful login with user id or unknown', async () => {
  const execute = jest.fn().mockResolvedValueOnce([[{verifier: 'v', redirect_uri: 'http://x/callback'}]]).mockResolvedValueOnce([]).mockResolvedValueOnce([[{user_id: '123'}]]);
  const {routes} = setup({dbExecute: execute, oauthToken: jest.fn().mockResolvedValue({access_token: 'token'})});
  const res = response();
  await routes.get('/test/callback')({query: {state: 's', code: 'c'}}, res);
  expect(res.send).toHaveBeenCalledWith(expect.stringContaining('123'));

  execute.mockResolvedValueOnce([[{verifier: 'v', redirect_uri: 'http://x/callback'}]]).mockResolvedValueOnce([]).mockResolvedValueOnce([[]]);
  const res2 = response();
  await routes.get('/test/callback')({query: {state: 's', code: 'c'}}, res2);
  expect(res2.send).toHaveBeenCalledWith(expect.stringContaining('unknown'));
});
