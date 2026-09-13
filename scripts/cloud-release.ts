import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { LambdaClient,UpdateFunctionConfigurationCommand,PublishVersionCommand,waitUntilFunctionUpdatedV2,GetFunctionConfigurationCommand } from '@aws-sdk/client-lambda';
import { Store } from '../packages/core/src/store.js';
import { Releases } from '../packages/core/src/aws.js';
import { verify } from '../packages/core/src/verifier.js';
import { loadRuntime } from '../packages/core/src/runtime.js';
const outputs=JSON.parse(await readFile('.env.cloud-outputs.json','utf8')).GreenAgain;
Object.assign(process.env,{TABLE_NAME:outputs.TableName,SUPPORT_FUNCTION:outputs.SupportFunction,SUPPORT_ALIAS:outputs.SupportAlias,RUNTIME_SECRET_ARN:outputs.SecretArn});
await loadRuntime();
const client=new LambdaClient({}),store=new Store(),releases=new Releases(),functionName=outputs.SupportFunction;
const commitSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const mode=process.argv[2]||'healthy';if(!['healthy','prompt-regression','tool-contract-regression'].includes(mode))throw new Error('Invalid mode');
const existing=await client.send(new GetFunctionConfigurationCommand({FunctionName:functionName}));
const releaseId=`r-${Date.now().toString(36)}`;
await client.send(new UpdateFunctionConfigurationCommand({FunctionName:functionName,Environment:{Variables:{...existing.Environment?.Variables,RELEASE_ID:releaseId,COMMIT_SHA:commitSha,PROMPT_VERSION:releaseId,DEMO_RELEASE_MODE:mode}}}));
await waitUntilFunctionUpdatedV2({client,maxWaitTime:120},{FunctionName:functionName});
const published=await client.send(new PublishVersionCommand({FunctionName:functionName,Description:`GreenAgain ${releaseId}`}));
if(!published.Version||!published.CodeSha256)throw new Error('Published release response incomplete');
const release={version:published.Version,releaseId,commitSha,artifactHash:published.CodeSha256};
await store.put(`RELEASE#${published.Version}`,release);
if(mode==='healthy'){
  const current=await releases.current();await releases.update(published.Version,current.revision);
  const verification=await verify(releases,published.Version);
  console.log(JSON.stringify({release,verification}));
  await store.put(`BASELINE_ATTEMPT#${releaseId}`,verification);
  if(verification.status!=='PASS')throw new Error('Baseline failed independent verification');
  await store.put('BASELINE',{...release,verifiedAt:new Date().toISOString(),verification});
}else{await store.put(mode==='prompt-regression'?'SCENARIO#prompt':'SCENARIO#tool',release);console.log(JSON.stringify({published:release,aliasUnchanged:true}));}
