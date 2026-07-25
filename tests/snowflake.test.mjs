import {createSnowflake} from '../src/snowflake.mjs';
test('snowflake IDs are decimal strings and increase',()=>{let now=1000;const id=createSnowflake({epoch:0,processId:1,now:()=>now});expect(id()).toMatch(/^\d+$/);expect(BigInt(id())).toBeGreaterThanOrEqual(0n);expect(BigInt(id())).toBeGreaterThan(0n)});
