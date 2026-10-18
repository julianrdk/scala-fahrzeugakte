import {runScheduled,type Env} from './worker';
export default {
 async fetch(){return new Response('Not found',{status:404});},
 async scheduled(_event:unknown,env:Env){await runScheduled(env);}
};
