import {jest} from '@jest/globals';
import {createApp} from '../src/app.mjs';
test('app factory mounts routes',()=>{const routes=[];const app={set:jest.fn(),use:jest.fn(),get:(p)=>routes.push(p),post:(p)=>routes.push(p)};const db={};const rateLimit=()=>()=>{};createApp({db,oauth:{},rateLimit,expressFactory:()=>app});expect(routes).toContain('/health')});
