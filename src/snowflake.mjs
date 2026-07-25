const EPOCH = 1782864000000n;
const MAX_SEQUENCE = 4095n;
export function createSnowflake({ workerId = 0, processId = process.pid, now = Date.now, epoch = EPOCH } = {}) {
  let last = -1n, sequence = 0n;
  return () => {
    let time = BigInt(now());
    if (time < last) time = last;
    if (time === last) { sequence = (sequence + 1n) & MAX_SEQUENCE; while (sequence === 0n) time = BigInt(now()); }
    else sequence = 0n;
    last = time;
    return (((time - BigInt(epoch)) << 22n) | ((BigInt(workerId) & 31n) << 17n) | ((BigInt(processId) & 31n) << 12n) | sequence).toString();
  };
}
export const snowflake = createSnowflake();
