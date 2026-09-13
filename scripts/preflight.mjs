import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
const env = process.env;
const checks = [
  ['AWS', async () => { const r = await new STSClient({}).send(new GetCallerIdentityCommand({})); return { authenticated: !!r.Account, region: env.AWS_REGION }; }],
  ['GitHub', async () => request('https://api.github.com/repos/madhu-garudala/GreenAgain', { Authorization: `Bearer ${env.GITHUB_TOKEN || env.Github_API_KEY}`, Accept: 'application/vnd.github+json' }, b => ({ repository: b.full_name, permissions: b.permissions }))],
  ['Slack', async () => request('https://slack.com/api/auth.test', { Authorization: `Bearer ${env.SLACK_BOT_TOKEN || env.SLACK_API_KEY}` }, b => ({ ok: b.ok, error: b.error }))],
  ['Slack channels', async () => request('https://slack.com/api/conversations.list?types=public_channel,private_channel&exclude_archived=true&limit=200', { Authorization: `Bearer ${env.SLACK_BOT_TOKEN || env.SLACK_API_KEY}` }, b => ({ ok: b.ok, error: b.error, channels: b.channels?.map(c => ({ id:c.id, name:c.name, member:c.is_member })) }))],
  ['Vercel', async () => request('https://api.vercel.com/v9/projects?limit=20', { Authorization: `Bearer ${env.VERCEL_API_KEY || env.Vercel_API_KEY}` }, b => ({ projects: b.projects?.map(p => ({id:p.id,name:p.name})), error:b.error?.code }))],
  ['LangSmith', async () => request(`${env.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com'}/sessions?limit=10`, { 'x-api-key':env.LANGSMITH_API_KEY }, b => ({ projects: Array.isArray(b) ? b.map(p=>({id:p.id,name:p.name})) : undefined }))],
  ['OpenAI models', async () => request('https://api.openai.com/v1/models', { Authorization:`Bearer ${env.OPENAI_API_KEY}` }, b => ({ available:b.data?.map(m=>m.id).filter(id=>/gpt-(4.1-mini|5-mini|5.6-luna|6-astra)$/.test(id)) }))],
];
async function request(url, headers, select) { const r=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});let b={};try{b=await r.json();}catch{}return {status:r.status,...select(b)}; }
await Promise.all(checks.map(async ([name,run])=>{try{console.log(JSON.stringify({name,...await run()}));}catch(e){console.log(JSON.stringify({name,error:e.name}));}}));
