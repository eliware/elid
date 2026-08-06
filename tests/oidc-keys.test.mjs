import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@jest/globals';
import { loadSigningKey, loadVerificationKeys, publicJwk, signJwt } from '../src/oidc-keys.mjs';

async function makeKeys() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'elid-keys-'));
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  await fs.writeFile(path.join(dir, 'current-private.pem'), privateKey.export({ type: 'pkcs8', format: 'pem' }));
  await fs.writeFile(path.join(dir, 'current-public.pem'), publicKey.export({ type: 'spki', format: 'pem' }));
  await fs.writeFile(path.join(dir, 'current-kid'), 'test-kid\n');
  return { dir, privateKey, publicKey };
}

test('loads signing key, exposes JWK, and signs JWTs', async () => {
  const { dir, publicKey } = await makeKeys();
  const key = await loadSigningKey(dir);
  expect(key).toMatchObject({ kid: 'test-kid', algorithm: 'RS256' });
  expect(publicJwk(key)).toMatchObject({ kid: 'test-kid', alg: 'RS256', use: 'sig', key_ops: ['verify'], kty: 'RSA' });
  const jwt = signJwt({ sub: 'user', n: 1 }, key);
  const [header, body, signature] = jwt.split('.');
  expect(JSON.parse(Buffer.from(header, 'base64url'))).toEqual({ alg: 'RS256', typ: 'JWT', kid: 'test-kid' });
  expect(JSON.parse(Buffer.from(body, 'base64url'))).toEqual({ sub: 'user', n: 1 });
  expect(crypto.verify('RSA-SHA256', Buffer.from(`${header}.${body}`), publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
  await fs.rm(dir, { recursive: true, force: true });
});

test('rejects an empty key id', async () => {
  const { dir } = await makeKeys();
  await fs.writeFile(path.join(dir, 'current-kid'), ' \n');
  await expect(loadSigningKey(dir)).rejects.toThrow('OIDC signing key id is empty');
  await fs.rm(dir, { recursive: true, force: true });
});

test('loads current and archived verification keys, skipping non-pem files', async () => {
  const { dir, publicKey } = await makeKeys();
  const archive = path.join(dir, 'archive');
  await fs.mkdir(archive);
  await fs.writeFile(path.join(archive, 'old.pem'), publicKey.export({ type: 'spki', format: 'pem' }));
  await fs.writeFile(path.join(archive, 'notes.txt'), 'skip');
  await expect(loadVerificationKeys(dir)).resolves.toEqual([
    expect.objectContaining({ kid: 'test-kid', algorithm: 'RS256' }),
    expect.objectContaining({ kid: 'old', publicKey: expect.any(String), algorithm: 'RS256' }),
  ]);
  await fs.rm(dir, { recursive: true, force: true });
});

test('allows a missing archive and rethrows other archive errors', async () => {
  const { dir } = await makeKeys();
  await expect(loadVerificationKeys(dir)).resolves.toHaveLength(1);
  await fs.mkdir(path.join(dir, 'archive'));
  await fs.rm(path.join(dir, 'archive'), { recursive: true });
  await fs.writeFile(path.join(dir, 'archive'), 'not a directory');
  await expect(loadVerificationKeys(dir)).rejects.toMatchObject({ code: 'ENOTDIR' });
  await fs.rm(dir, { recursive: true, force: true });
});

test('default key directories are used when omitted', async () => {
  await expect(loadSigningKey()).resolves.toMatchObject({ algorithm: 'RS256' });
  await expect(loadVerificationKeys()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ algorithm: 'RS256' })]));
});
