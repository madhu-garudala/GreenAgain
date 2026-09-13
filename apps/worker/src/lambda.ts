import { randomUUID } from 'node:crypto';
import { Store } from '../../../packages/core/src/store.js';
import { loadRuntime } from '../../../packages/core/src/runtime.js';
import { investigate } from '../../../packages/core/src/engine.js';
import { Releases } from '../../../packages/core/src/aws.js';
import type { Release } from '../../../packages/core/src/contracts.js';
export async function handler(event:{Records:{messageId:string;body:string}[]}){
  await loadRuntime();const store=new Store();const failures:{itemIdentifier:string}[]=[];
  for(const record of event.Records){const owner=randomUUID();let acquired=false;let timer:ReturnType<typeof setInterval>|undefined;
    try{
      acquired=await store.lease('support-agent/production',owner,660);if(!acquired)throw new Error('Environment busy');
      timer=setInterval(()=>{void store.lease('support-agent/production',owner,660).catch(()=>{});},30000);
      const job=JSON.parse(record.body) as {id:string;kind:string;incidentId?:string;scenario?:string};
      if(job.kind==='incident'&&job.incidentId){await investigate(store,job.incidentId);const active=await store.get<{id:string}>('ACTIVE_SCENARIO');if(active)await store.releaseLease('scenario',active.id).catch(()=>{});}
      else if(job.kind==='scenario'||job.kind==='reset'){
        if(!await store.get(`JOB_DONE#${job.id}`)){
          const releases=new Releases(),baseline=await store.get<Release>('BASELINE');if(!baseline)throw new Error('Verified baseline is required');
          const target=job.kind==='reset'?baseline:await store.get<Release>(job.scenario==='prompt_regression'?'SCENARIO#prompt':'SCENARIO#tool');if(!target)throw new Error('Scenario release is not published');
          const current=await releases.current();
          await store.put(`JOB_INTENT#${job.id}`,{...job,fromVersion:current.version,revision:current.revision,targetVersion:target.version});
          await releases.update(target.version,current.revision);
          await store.put(`JOB_DONE#${job.id}`,{at:new Date().toISOString(),version:target.version});
          await store.put('ACTIVE_SCENARIO',{id:job.id,startedAt:new Date().toISOString(),version:target.version});
          await store.put(`AUDIT#${job.id}`,{...job,at:new Date().toISOString(),fromVersion:current.version,targetVersion:target.version});
          if(job.kind==='scenario')await releases.invoke('My headphones arrived damaged. Can I get a replacement?','ord-1001',releases.alias,'traffic');
          else await store.releaseLease('scenario',job.id).catch(()=>{});
        }
      }else throw new Error('Unsupported job');
    }catch(e){console.error(JSON.stringify({event:'job_failed',id:record.messageId,error:e instanceof Error?e.name:'Error',message:e instanceof Error?e.message:'Processing failed'}));failures.push({itemIdentifier:record.messageId});}
    finally{if(timer)clearInterval(timer);if(acquired)await store.releaseLease('support-agent/production',owner).catch(()=>{});}
  }
  return{batchItemFailures:failures};
}
