import {readFile} from 'node:fs/promises';
const outputs=JSON.parse(await readFile('.env.cloud-outputs.json','utf8')).GreenAgain;
const headers={authorization:`Bearer ${process.env.GITHUB_TOKEN||process.env.Github_API_KEY}`,accept:'application/vnd.github+json','content-type':'application/json'};
const base='https://api.github.com/repos/madhu-garudala/GreenAgain';
for(const[name,value]of Object.entries({AWS_BUILD_ROLE_ARN:outputs.BuildRoleArn,WORKER_REPOSITORY_URI:outputs.RepositoryUri})){
  let r=await fetch(`${base}/actions/variables`,{method:'POST',headers,body:JSON.stringify({name,value})});
  if(r.status===409)r=await fetch(`${base}/actions/variables/${name}`,{method:'PATCH',headers,body:JSON.stringify({name,value})});
  if(!r.ok)throw new Error(`GitHub build variable ${name} HTTP ${r.status}`);
}
console.log('Repository-scoped build variables configured.');
