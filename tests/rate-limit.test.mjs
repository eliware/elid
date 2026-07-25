import {jest} from '@jest/globals';
import {rateLimit} from '../src/rate-limit.mjs';
test('rate limiter rejects after max',async()=>{const calls=[];let lookup=0;const db={execute:jest.fn(async()=>lookup++?[[{count:1,reset_at:new Date(Date.now()+60000)}]]:[[]])};const r=rateLimit({db,max:1});const res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn()};const req={ip:'1'};await r(req,res,()=>calls.push(1));await r(req,res,()=>calls.push(1));expect(calls).toHaveLength(1);expect(res.status).toHaveBeenCalledWith(429)});
