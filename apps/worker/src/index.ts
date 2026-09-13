import { randomUUID } from 'node:crypto';
import { SQSClient,ReceiveMessageCommand,DeleteMessageCommand,ChangeMessageVisibilityCommand } from '@aws-sdk/client-sqs';
import { Store } from '../../../packages/core/src/store.js';
import { loadRuntime,required } from '../../../packages/core/src/runtime.js';
import { investigate } from '../../../packages/core/src/engine.js';
import { Releases } from '../../../packages/core/src/aws.js';
import type { Release } from '../../../packages/core/src/contracts.js';

async function main(){await loadRuntime();const queue=new SQSClient({}),store=new Store(),url=required('QUEUE_URL');
  for(;;){const response=await queue.send(new ReceiveMessageCommand({QueueUrl:url,MaxNumberOfMessages:1,WaitTimeSeconds:20,VisibilityTimeout:120}));
    for(const message of response.Messages||[]){if(!message.Body||!message.ReceiptHandle)continue;const receipt=message.ReceiptHandle;const owner=randomUUID();
      if(!await store.lease('support-agent/production',owner))continue;
      const heartbeat=setInterval(()=>{void Promise.all([store.lease('support-agent/production',owner),queue.send(new ChangeMessageVisibilityCommand({QueueUrl:url,ReceiptHandle:receipt,VisibilityTimeout:120}))]).catch(()=>{console.error('Heartbeat failed; stopping worker to avoid competing execution');process.exit(1);});},30000);
      try{const job=JSON.parse(message.Body) as {id:string;kind:string;incidentId?:string;scenario?:string};
        if(job.kind==='incident'&&job.incidentId)await investigate(store,job.incidentId);
        else if(job.kind==='scenario'||job.kind==='reset'){
          if(!await store.get(`JOB_DONE#${job.id}`)){
            const releases=new Releases(),baseline=await store.get<Release>('BASELINE');if(!baseline)throw new Error('Baseline verification required before demo controls');
            const target=job.kind==='reset'?baseline:await store.get<Release>(job.scenario==='prompt_regression'?'SCENARIO#prompt':'SCENARIO#tool');if(!target)throw new Error('Requested release has not been published');
            const current=await releases.current();await releases.update(target.version,current.revision);
            await store.put(`JOB_DONE#${job.id}`,{at:new Date().toISOString(),version:target.version});
            await store.put(`AUDIT#${job.id}`,{...job,at:new Date().toISOString(),fromVersion:current.version,targetVersion:target.version});
            if(job.kind==='scenario')await releases.invoke('My headphones arrived damaged. Can I get a replacement?','ord-1001',releases.alias,'traffic');
          }
        }else throw new Error('Unsupported job');
        await queue.send(new DeleteMessageCommand({QueueUrl:url,ReceiptHandle:receipt}));
      }catch(e){console.error(JSON.stringify({event:'job_failed',error:e instanceof Error?e.name:'Error'}));}
      finally{clearInterval(heartbeat);await store.releaseLease('support-agent/production',owner);}
    }
  }
}
main().catch(e=>{console.error(e instanceof Error?e.name:'WorkerError');process.exitCode=1;});
