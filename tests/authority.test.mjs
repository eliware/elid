import {jest} from '@jest/globals';
import {authorityOrigin, authorityIssuer} from '../src/authority.mjs';

const request = (host, forwardedProto) => ({
  get: jest.fn().mockReturnValue(host),
  headers: forwardedProto === undefined ? {} : {'x-forwarded-proto': forwardedProto},
});

afterEach(() => {
  delete process.env.OAUTH_AUTHORITY_HOSTS;
  delete process.env.OAUTH_ISSUER;
  delete process.env.NODE_ENV;
});

test('uses configured authority host and HTTPS by default', () => {
  process.env.OAUTH_AUTHORITY_HOSTS = 'auth.example.test';
  expect(authorityOrigin(request('auth.example.test'))).toBe('https://auth.example.test');
});

test('accepts forwarded HTTP outside production and strips no host port', () => {
  process.env.OAUTH_AUTHORITY_HOSTS = 'auth.example.test';
  process.env.NODE_ENV = 'development';
  expect(authorityOrigin(request('auth.example.test:8080', 'http'))).toBe('http://auth.example.test:8080');
  expect(authorityOrigin(request('auth.example.test', 'http,https'))).toBe('http://auth.example.test');
});

test('falls back to configured issuer for unknown or missing hosts', () => {
  process.env.OAUTH_ISSUER = 'https://issuer.example.test';
  process.env.OAUTH_AUTHORITY_HOSTS = 'auth.example.test';
  expect(authorityOrigin(request('unknown.example.test'))).toBe('https://issuer.example.test');
  expect(authorityOrigin({headers: {}})).toBe('https://issuer.example.test');
  expect(authorityIssuer()).toBe('https://issuer.example.test');
});

test('uses the default issuer when unset', () => {
  expect(authorityIssuer()).toBe('https://auth.eliware.org');
});
