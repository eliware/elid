import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';
import { loadSigningKey, publicJwk } from '../src/oidc-keys.mjs';

test('loads an RS256 signing key and exposes a public JWK', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'elid-keys-'));
  const { generateKeyPairSync } = await import('node:crypto');
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  await fs.writeFile(path.join(dir, 'current-private.pem'), privateKey.export({ type: 'pkcs8', format: 'pem' }));
  await fs.writeFile(path.join(dir, 'current-public.pem'), publicKey.export({ type: 'spki', format: 'pem' }));
  await fs.writeFile(path.join(dir, 'current-kid'), 'test-kid\n');
  const key = await loadSigningKey(dir);
  expect(key.algorithm).toBe('RS256');
  expect(publicJwk(key)).toMatchObject({ kid: 'test-kid', alg: 'RS256', use: 'sig', kty: 'RSA' });
  await fs.rm(dir, { recursive: true, force: true });
});
