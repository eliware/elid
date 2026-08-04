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
