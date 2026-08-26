import {randomToken,digest,pkce,safeEqual,csrfToken} from '../src/crypto.mjs';
test('crypto helpers',()=>{expect(randomToken()).toMatch(/^[A-Za-z0-9_-]+$/);expect(digest('x')).toHaveLength(64);expect(pkce('x')).toMatch(/^[A-Za-z0-9_-]+$/);expect(safeEqual('a','a')).toBe(true);expect(safeEqual('a','b')).toBe(false)});
test('csrf tokens are bound to the session',()=>{expect(csrfToken('a')).toBe(csrfToken('a'));expect(csrfToken('a')).not.toBe(csrfToken('b'));expect(csrfToken()).toBeTruthy();});
test('csrf token honors configured secret',()=>{const old=process.env.SESSION_CSRF_SECRET;process.env.SESSION_CSRF_SECRET='test-secret';expect(csrfToken('a')).toMatch(/^[A-Za-z0-9_-]+$/);if(old===undefined)delete process.env.SESSION_CSRF_SECRET;else process.env.SESSION_CSRF_SECRET=old;});
