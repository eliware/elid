import {randomToken,digest,pkce,safeEqual} from '../src/crypto.mjs';
test('crypto helpers',()=>{expect(randomToken()).toMatch(/^[A-Za-z0-9_-]+$/);expect(digest('x')).toHaveLength(64);expect(pkce('x')).toMatch(/^[A-Za-z0-9_-]+$/);expect(safeEqual('a','a')).toBe(true);expect(safeEqual('a','b')).toBe(false)});
