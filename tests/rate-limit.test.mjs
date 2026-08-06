import {jest} from '@jest/globals';
import {envNumber,rateLimit} from '../src/rate-limit.mjs';

describe('envNumber',()=>{
  afterEach(()=>delete process.env.TEST_RATE_NUMBER);
  test.each([['42',42],['0',7],['-1',7],['nope',7],['Infinity',7]])('%s', (value,expected)=>{
    process.env.TEST_RATE_NUMBER=value;
    expect(envNumber('TEST_RATE_NUMBER',7)).toBe(expected);
  });
  test('missing value uses fallback',()=>expect(envNumber('TEST_RATE_NUMBER',7)).toBe(7));
});

describe('rateLimit',()=>{
  const now=new Date('2026-08-06T00:00:00.000Z');
  beforeEach(()=>jest.useFakeTimers().setSystemTime(now));
  afterEach(()=>jest.useRealTimers());

  const response=()=>({setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn()});

  test('uses defaults and allows a first request',async()=>{
    rateLimit();
    const db={execute:jest.fn().mockResolvedValue([[]])};
    const res=response(); const next=jest.fn();
    await rateLimit({db})({socket:{remoteAddress:'10.0.0.1'}},res,next);
    expect(next).toHaveBeenCalledWith();
    expect(res.setHeader).toHaveBeenNthCalledWith(1,'RateLimit-Limit',120);
    expect(res.setHeader).toHaveBeenNthCalledWith(2,'RateLimit-Remaining',119);
    expect(db.execute).toHaveBeenCalled();
  });

  test('increments an unexpired bucket and rejects over max',async()=>{
    const db={execute:jest.fn()
      .mockResolvedValueOnce([[{count:2,reset_at:new Date(now.getTime()+30000)}]])
      .mockResolvedValueOnce([[]])};
    const res=response(); const next=jest.fn();
    await rateLimit({db,max:2,message:'wait'})({ip:'client'},res,next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({error:'rate_limit_exceeded',error_description:'wait'});
    expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Remaining',0);
    expect(db.execute).toHaveBeenLastCalledWith(expect.any(String),['client',3,expect.any(Date),3,expect.any(Date)]);
  });

  test('resets an expired bucket and uses socket key',async()=>{
    const db={execute:jest.fn().mockResolvedValueOnce([[{count:9,reset_at:new Date(now.getTime()-1)}]]).mockResolvedValueOnce([[]])};
    const res=response(); const next=jest.fn();
    await rateLimit({db,windowMs:10000,max:5})({socket:{remoteAddress:'socket-client'}},res,next);
    expect(next).toHaveBeenCalledWith();
    expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Reset',10);
    expect(db.execute).toHaveBeenLastCalledWith(expect.any(String),['socket-client',1,expect.any(Date),1,expect.any(Date)]);
  });

  test('uses unknown key and forwards database errors',async()=>{
    const error=new Error('db down'); const db={execute:jest.fn().mockRejectedValue(error)};
    const next=jest.fn();
    await rateLimit({db})({socket:{}},response(),next);
    expect(next).toHaveBeenCalledWith(error);
  });
});
