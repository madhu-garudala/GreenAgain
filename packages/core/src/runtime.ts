import { SecretsManagerClient,GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
let loaded:Promise<void>|undefined;
export function loadRuntime(){return loaded??= (async()=>{if(process.env.RUNTIME_SECRET_ARN){const r=await new SecretsManagerClient({}).send(new GetSecretValueCommand({SecretId:process.env.RUNTIME_SECRET_ARN}));const values=JSON.parse(r.SecretString||'{}');for(const [k,v]of Object.entries(values))if(typeof v==='string')process.env[k]=v;}})();}
export function required(name:string){const v=process.env[name];if(!v)throw new Error(`${name} is not configured`);return v;}
