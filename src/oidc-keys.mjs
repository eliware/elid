import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const OIDC_KEY_DIR = process.env.OIDC_KEY_DIR || '/var/lib/elid/keys';

export async function loadSigningKey(keyDir = OIDC_KEY_DIR) {
  const privateKey = await fs.readFile(path.join(keyDir, 'current-private.pem'), 'utf8');
  const publicKey = await fs.readFile(path.join(keyDir, 'current-public.pem'), 'utf8');
  const kid = (await fs.readFile(path.join(keyDir, 'current-kid'), 'utf8')).trim();
  if (!kid) throw new Error('OIDC signing key id is empty');
  return { kid, privateKey, publicKey, algorithm: 'RS256' };
}

export function publicJwk(key) {
  const jwk = crypto.createPublicKey(key.publicKey).export({ format: 'jwk' });
  return { ...jwk, kid: key.kid, alg: key.algorithm, use: 'sig', key_ops: ['verify'] };
}

export function signJwt(payload, key) {
  const header = Buffer.from(JSON.stringify({ alg: key.algorithm, typ: 'JWT', kid: key.kid })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const input = `${header}.${body}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(input), key.privateKey).toString('base64url');
  return `${input}.${signature}`;
}

export async function loadVerificationKeys(keyDir = OIDC_KEY_DIR) {
  const keys = [await loadSigningKey(keyDir)];
  const archive = path.join(keyDir, 'archive');
  try {
    for (const name of await fs.readdir(archive)) {
      if (!name.endsWith('.pem')) continue;
      const kid = name.slice(0, -4);
      const publicKey = await fs.readFile(path.join(archive, name), 'utf8');
      keys.push({ kid, publicKey, algorithm: 'RS256' });
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return keys;
}
