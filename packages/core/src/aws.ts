import { LambdaClient,GetAliasCommand,UpdateAliasCommand,InvokeCommand } from '@aws-sdk/client-lambda';
import { required } from './runtime.js';
export type SupportOutput={decision:string;orderId:string;policyId:string;explanation:string;toolCalls:{name:string;status:string;summary:string}[];releaseId:string;executedVersion:string;traceId?:string;error?:string};
export class Releases {
  readonly client=new LambdaClient({});
  constructor(readonly functionName=required('SUPPORT_FUNCTION'),readonly alias=process.env.SUPPORT_ALIAS||'production'){}
  async current(){const r=await this.client.send(new GetAliasCommand({FunctionName:this.functionName,Name:this.alias}));if(!r.FunctionVersion||!r.RevisionId)throw new Error('Alias response missing version/revision');if(Object.keys(r.RoutingConfig?.AdditionalVersionWeights||{}).length)throw new Error('Weighted alias unsupported');return{version:r.FunctionVersion,revision:r.RevisionId};}
  async update(version:string,revision:string){await this.client.send(new UpdateAliasCommand({FunctionName:this.functionName,Name:this.alias,FunctionVersion:version,RevisionId:revision}));await new Promise(resolve=>setTimeout(resolve,3000));return this.current();}
  async invoke(message:string,orderId:string,qualifier=this.alias,source:'traffic'|'evaluation'='evaluation'):Promise<SupportOutput>{
    const r=await this.client.send(new InvokeCommand({FunctionName:this.functionName,Qualifier:qualifier,Payload:Buffer.from(JSON.stringify({message,orderId,source}))}));
    if(r.FunctionError||!r.Payload)throw new Error('Support Lambda invocation failed');
    const value=JSON.parse(Buffer.from(r.Payload).toString()) as SupportOutput;
    if(r.ExecutedVersion!==value.executedVersion)throw new Error('Executed version does not match response');
    return value;
  }
}
