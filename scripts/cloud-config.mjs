import { readFile,writeFile } from 'node:fs/promises';
import { randomBytes,scryptSync } from 'node:crypto';
import { SecretsManagerClient,PutSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { IAMClient,CreateAccessKeyCommand,ListAccessKeysCommand } from '@aws-sdk/client-iam';
import { BudgetsClient,CreateBudgetCommand } from '@aws-sdk/client-budgets';
import { STSClient,GetCallerIdentityCommand } from '@aws-sdk/client-sts';
const outputs=JSON.parse(await readFile('.env.cloud-outputs.json','utf8')).GreenAgain;
const mode=process.argv[2]||'runtime';
const env=process.env;
if(mode==='runtime'){
  const values={OPENAI_API_KEY:env.OPENAI_API_KEY,OPENAI_MODEL:env.OPENAI_MODEL||'gpt-4.1-mini',LANGSMITH_API_KEY:env.LANGSMITH_API_KEY,LANGSMITH_ENDPOINT:env.LANGSMITH_ENDPOINT||'https://api.smith.langchain.com',LANGSMITH_PROJECT:env.LANGSMITH_PROJECT||'GreenAgain',LANGSMITH_EVAL_PROJECT:'GreenAgain-evaluation',GITHUB_TOKEN:env.GITHUB_TOKEN||env.Github_API_KEY,SLACK_BOT_TOKEN:env.SLACK_BOT_TOKEN||env.SLACK_API_KEY,SLACK_CHANNEL_ID:env.SLACK_CHANNEL_ID||env.SLACK_CHANNEL_NAME||'all-agents-playground',SLACK_CHANNEL_NAME:env.SLACK_CHANNEL_NAME||'all-agents-playground',GITHUB_REPOSITORY:'madhu-garudala/GreenAgain'};
  await new SecretsManagerClient({}).send(new PutSecretValueCommand({SecretId:outputs.SecretArn,SecretString:JSON.stringify(values)}));console.log('Cloud runtime secret configured (values hidden).');
}
if(mode==='web'){
  let config;try{config=JSON.parse(await readFile('.env.web-config.json','utf8'));}catch{
    const iam=new IAMClient({});const keys=await iam.send(new ListAccessKeysCommand({UserName:outputs.WebUserName}));if(keys.AccessKeyMetadata?.length)throw new Error('Existing runtime key found; restore .env.web-config.json rather than minting duplicate keys');
    const r=await iam.send(new CreateAccessKeyCommand({UserName:outputs.WebUserName}));
    const password=randomBytes(18).toString('base64url'),salt=randomBytes(16).toString('hex');
    config={AWS_ACCESS_KEY_ID:r.AccessKey.AccessKeyId,AWS_SECRET_ACCESS_KEY:r.AccessKey.SecretAccessKey,AWS_REGION:env.AWS_REGION,OPERATOR_EMAIL:'madhu.garudala@gmail.com',OPERATOR_PASSWORD_HASH:`${salt}:${scryptSync(password,salt,64).toString('hex')}`,SESSION_SECRET:randomBytes(32).toString('hex'),TABLE_NAME:outputs.TableName,QUEUE_URL:outputs.QueueUrl,SUPPORT_FUNCTION:outputs.SupportFunction,SUPPORT_ALIAS:outputs.SupportAlias};
    await writeFile('.env.web-config.json',JSON.stringify(config),{mode:0o600});
    await writeFile('.env.operator-access.txt',`GreenAgain operator login\nEmail: ${config.OPERATOR_EMAIL}\nPassword: ${password}\n`,{mode:0o600});
  }
  const token=env.VERCEL_API_KEY||env.Vercel_API_KEY,base='https://api.vercel.com';
  const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
  const project=await fetch(`${base}/v9/projects/green-again`,{headers});if(!project.ok)throw new Error(`Vercel project HTTP ${project.status}`);const p=await project.json();
  const scope=`?teamId=${p.accountId}`;
  const settings=await fetch(`${base}/v9/projects/${p.id}${scope}`,{method:'PATCH',headers,body:JSON.stringify({framework:'nextjs',rootDirectory:'apps/web',buildCommand:'npm run build --workspace=@greenagain/web',installCommand:'npm install',nodeVersion:'22.x'})});if(!settings.ok)throw new Error(`Project settings HTTP ${settings.status}`);
  for(const [key,value]of Object.entries(config)){
    const r=await fetch(`${base}/v10/projects/${p.id}/env${scope}&upsert=true`,{method:'POST',headers,body:JSON.stringify({key,value,type:'encrypted',target:['production','preview']})});if(!r.ok)throw new Error(`Vercel variable ${key} HTTP ${r.status}`);
  }
  console.log('Vercel server configuration set. Private operator login saved to .env.operator-access.txt.');
}
if(mode==='budget'){
  const {Account}=await new STSClient({}).send(new GetCallerIdentityCommand({}));
  try{await new BudgetsClient({region:'us-east-1'}).send(new CreateBudgetCommand({AccountId:Account,Budget:{BudgetName:'GreenAgain-monthly',BudgetLimit:{Amount:'50',Unit:'USD'},TimeUnit:'MONTHLY',BudgetType:'COST',CostFilters:{TagKeyValue:['user:Project$GreenAgain']}},NotificationsWithSubscribers:[{Notification:{NotificationType:'ACTUAL',ComparisonOperator:'GREATER_THAN',Threshold:80,ThresholdType:'PERCENTAGE'},Subscribers:[{SubscriptionType:'EMAIL',Address:'madhu.garudala@gmail.com'}]}]}));console.log('GreenAgain $50 monthly budget alert created at 80%; it is an alert, not a spending cap.');}catch(e){if(e.name==='DuplicateRecordException')console.log('Budget alert already exists.');else throw e;}
}
