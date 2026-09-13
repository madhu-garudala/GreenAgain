import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {LambdaClient,UpdateFunctionCodeCommand,waitUntilFunctionUpdatedV2} from '@aws-sdk/client-lambda';
import {CloudFormationClient,ListStackResourcesCommand} from '@aws-sdk/client-cloudformation';
const o=JSON.parse(await readFile('.env.cloud-outputs.json','utf8')).GreenAgain,c=new LambdaClient({});
const resources=await new CloudFormationClient({}).send(new ListStackResourcesCommand({StackName:'GreenAgain'}));
const dispatcher=resources.StackResourceSummaries.find(x=>x.ResourceType==='AWS::Lambda::Function'&&x.LogicalResourceId.startsWith('Dispatcher')).PhysicalResourceId;
for(const [name,path]of [[o.SupportFunction,'support'],[o.PollerName,'poller'],[dispatcher,'poller']]){
  execFileSync('zip',['-q',`../${path}.zip`,'index.js'],{cwd:`dist/${path}`});
  await c.send(new UpdateFunctionCodeCommand({FunctionName:name,ZipFile:await readFile(`dist/${path}.zip`)}));
  await waitUntilFunctionUpdatedV2({client:c,maxWaitTime:120},{FunctionName:name});
  console.log(`Updated ${name}`);
}
