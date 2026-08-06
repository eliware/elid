import { createSnowflakeGenerator, snowflake } from '../src/snowflake.mjs';

test('generates decimal IDs with the configured shared generator', () => {
  let now = 365662380000;
  const id = createSnowflakeGenerator({ epoch: now, workerId: 1, processId: 2, now: () => now })();
  expect(id).toMatch(/^\d+$/);
  expect(BigInt(id)).toBeGreaterThanOrEqual(0n);
});

test('exports the application generator', () => {
  expect(snowflake()).toMatch(/^\d+$/);
});
