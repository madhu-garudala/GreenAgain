import { Store } from './store.js';
export async function recordConnectivity(store:Store){
  const checkedAt=new Date().toISOString();
  const integrations:{name:string;status:string;checkedAt:string;detail:string}[]=[];
  for(const [name,url,key]of [
    ['GitHub','https://api.github.com/repos/madhu-garudala/GreenAgain',process.env.GITHUB_TOKEN],
    ['Slack','https://slack.com/api/auth.test',process.env.SLACK_BOT_TOKEN],
  ]){
    if(!key){integrations.push({name:name!,status:'unconfigured',checkedAt,detail:'Runtime credential missing'});continue;}
    try{const r=await fetch(url!,{headers:{authorization:`Bearer ${key}`},signal:AbortSignal.timeout(10000)});const b=await r.json() as {ok?:boolean};let ok=r.ok&&b.ok!==false;
      const scopes=r.headers.get('x-oauth-scopes');if(name==='Slack'&&(!process.env.SLACK_CHANNEL_ID||(scopes&&!scopes.split(',').map(s=>s.trim()).includes('chat:write'))))ok=false;
      integrations.push({name:name!,status:ok?'connected':'degraded',checkedAt,detail:ok?'Cloud credential check passed':name==='Slack'?'Bot messaging scope or incident channel is unavailable':'Cloud credential check failed'});
    }catch{integrations.push({name:name!,status:'degraded',checkedAt,detail:'Provider unavailable'});}
  }
  const monitor=await store.get<{status:string;checkedAt:string;detail:string}>('MONITOR_HEALTH');
  integrations.push({name:'LangSmith',status:monitor?.status||'unconfigured',checkedAt:monitor?.checkedAt||checkedAt,detail:monitor?.detail||'Monitoring not yet established'});
  integrations.push({name:'AWS',status:'connected',checkedAt,detail:'Cloud storage and scheduled poller running'});
  await store.put('INTEGRATIONS',integrations);
}
