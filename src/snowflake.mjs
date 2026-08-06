import { createSnowflakeGenerator } from '@eliware/snowflake';

const workerSource = process.env.SNOWFLAKE_WORKER_ID ?? process.env.WORKER_ID ?? '0';
const processSource = process.env.SNOWFLAKE_PROCESS_ID ?? process.env.PROCESS_ID ?? String(process.pid % 32);

function numericId(value) {
  if (/^\d+$/.test(value)) return Number(value);
  const ordinal = value.match(/-(\d+)$/);
  if (ordinal) return Number(ordinal[1]) % 32;
  let hash = 0;
  for (const character of value) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  return hash % 32;
}

export const snowflake = createSnowflakeGenerator({
  workerId: numericId(workerSource, 'workerId'),
  processId: numericId(processSource, 'processId'),
});

export { createSnowflakeGenerator };
