import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
export const randomToken = (bytes=32) => randomBytes(bytes).toString('base64url');
export const digest = value => createHash('sha256').update(value).digest('hex');
export const safeEqual = (a,b) => { const x=Buffer.from(a), y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); };
export const validRedirect = (uris, uri) => Array.isArray(uris) && uris.includes(uri);

export const pkce = value => createHash('sha256').update(value).digest('base64url');
