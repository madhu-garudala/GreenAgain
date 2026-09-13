import { SQSClient,SendMessageCommand } from '@aws-sdk/client-sqs';
import { Store } from '../../../packages/core/src/store.js';
import { Releases } from '../../../packages/core/src/aws.js';
import { loadRuntime,required } from '../../../packages/core/src/runtime.js';
import { LangSmithClient } from '@greenagain/integrations';
import { recordConnectivity } from '../../../packages/core/src/connectivity.js';
const queue=new SQSClient({});
export async function dispatch(){const store=new Store();for(const row of await store.pending()){await queue.send(new SendMessageCommand({QueueUrl:required('QUEUE_URL'),MessageBody:JSON.stringify(row.data)}));await store.sent(row.pk);}return {ok:true};}
export async function handler(){
  await loadRuntime();const store=new Store(),releases=new Releases();
  await dispatch();
  await recordConnectivity(store);
  const baseline=await store.get('BASELINE');if(!baseline)return{status:'baseline_not_established'};
  const current=await releases.current();
  // A canary is real cloud traffic; evaluation traffic is isolated in its own project.
  try{await releases.invoke('My headphones arrived damaged. Can I get a replacement?','ord-1001',releases.alias,'traffic');}catch{await store.put('MONITOR_HEALTH',{status:'degraded',checkedAt:new Date().toISOString(),detail:'Canary invocation unavailable'});}
  const langsmith=new LangSmithClient({apiKey:required('LANGSMITH_API_KEY'),endpoint:process.env.LANGSMITH_ENDPOINT,project:required('LANGSMITH_PROJECT')});
  const previous=await store.get<{at:string}>('CURSOR');
  const now=new Date(),start=new Date(Math.max(now.getTime()-15*60000,previous?Date.parse(previous.at)-5*60000:now.getTime()-5*60000)).toISOString();
  let cursor:string|undefined;let pages=0;const seen=new Set<string>();
  do{
    const page=await langsmith.queryTraces({start,limit:100,cursor});
    for(const trace of page.runs){
      if(trace.parent_run_id||!trace.end_time)continue;
      const meta=trace.extra?.metadata as Record<string,unknown>|undefined;
      if(meta?.source!=='traffic'||String(meta.functionVersion)!==current.version)continue;
      const raw=trace.outputs as Record<string,unknown>|undefined;
      const answer=raw?.answer as {decision?:string;orderId?:string;policyId?:string;toolOutcomes?:{name:string;status:string}[]}|undefined;
      const inputs=trace.inputs as {question?:string}|undefined;
      // Detection only uses the fixed canary; ordinary user questions are not scored as this case.
      if(!inputs?.question?.includes('ord-1001'))continue;
      const pass=!trace.error&&answer?.orderId==='ord-1001'&&answer.decision==='eligible'&&answer.policyId==='returns-standard-v1'&&['lookup_order','read_return_policy','check_replacement_eligibility'].every(name=>answer.toolOutcomes?.some(t=>t.name===name&&t.status==='ok'));
      if(pass)continue;
      const summary=trace.error?'Cloud canary ended with an application error.':'Cloud canary failed protected replacement-policy or required-tool checks.';
      await store.ingest({id:trace.id,traceId:trace.id,releaseId:String(meta.releaseId||'unknown'),version:current.version,deploymentRevision:current.revision,summary,observedAt:trace.end_time,input:{message:'My headphones arrived damaged. Can I get a replacement?',orderId:'ord-1001'},output:raw||{error:trace.error}});
    }
    cursor=page.cursors?.next;if(cursor&&seen.has(cursor))throw new Error('Trace pagination cursor repeated');if(cursor)seen.add(cursor);
  }while(cursor&&++pages<10);
  // Do not advance past unprocessed pages.
  if(!cursor)await store.put('CURSOR',{at:now.toISOString()});
  await store.put('MONITOR_HEALTH',{status:'connected',checkedAt:new Date().toISOString(),detail:'Cloud canary and trace query completed'});
  await recordConnectivity(store);
  await dispatch();return{status:'queried'};
}
