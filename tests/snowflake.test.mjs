import { afterEach, expect, jest, test } from '@jest/globals';

const originalWorker = process.env.SNOWFLAKE_WORKER_ID;
const originalProcess = process.env.SNOWFLAKE_PROCESS_ID;
const originalWorkerFallback = process.env.WORKER_ID;
const originalProcessFallback = process.env.PROCESS_ID;

async function loadSnowflake(env = {}) {
  jest.resetModules();
  for (const key of [
    'SNOWFLAKE_WORKER_ID', 'SNOWFLAKE_PROCESS_ID', 'WORKER_ID', 'PROCESS_ID',
  ]) delete process.env[key];
  Object.assign(process.env, env);
  return import('../src/snowflake.mjs');
}

afterEach(() => {
  jest.resetModules();
  for (const [key, value] of Object.entries({
    SNOWFLAKE_WORKER_ID: originalWorker,
    SNOWFLAKE_PROCESS_ID: originalProcess,
    WORKER_ID: originalWorkerFallback,
    PROCESS_ID: originalProcessFallback,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('generates decimal IDs with the configured shared generator', async () => {
  const { createSnowflakeGenerator } = await loadSnowflake({
    SNOWFLAKE_WORKER_ID: '1',
    SNOWFLAKE_PROCESS_ID: '2',
  });
  let now = 365662380000;
  const id = createSnowflakeGenerator({ epoch: now, workerId: 1, processId: 2, now: () => now })();
  expect(id).toMatch(/^\d+$/);
  expect(BigInt(id)).toBeGreaterThanOrEqual(0n);
});

test.each([
  ['ordinal worker and process', { WORKER_ID: 'worker-33', PROCESS_ID: 'process-65' }],
  ['hashed worker and process', { SNOWFLAKE_WORKER_ID: 'worker', SNOWFLAKE_PROCESS_ID: 'process' }],
  ['numeric fallbacks', { WORKER_ID: '3', PROCESS_ID: '4' }],
  ['default values', {}],
])('loads configuration using %s', async (_name, env) => {
  const { snowflake } = await loadSnowflake(env);
  expect(snowflake()).toMatch(/^\d+$/);
});

test('exports the application generator', async () => {
  const { snowflake } = await loadSnowflake({
    SNOWFLAKE_WORKER_ID: '0',
    SNOWFLAKE_PROCESS_ID: '0',
  });
  expect(snowflake()).toMatch(/^\d+$/);
});
