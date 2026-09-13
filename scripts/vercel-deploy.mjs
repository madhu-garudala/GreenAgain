import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const token=process.env.VERCEL_API_KEY||process.env.Vercel_API_KEY;
const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
const r=await fetch('https://api.vercel.com/v9/projects/green-again',{headers});if(!r.ok)throw new Error(`Project HTTP ${r.status}`);const p=await r.json();
const paths=execFileSync('git',['ls-files'],{encoding:'utf8'}).trim().split('\n').filter(path=>!path.startsWith('.env')&&!path.startsWith('.github/'));
const files=await Promise.all(paths.map(async file=>({file,data:await readFile(file,'utf8')})));
const response=await fetch(`https://api.vercel.com/v13/deployments?teamId=${p.accountId}`,{method:'POST',headers,body:JSON.stringify({name:p.name,project:p.id,target:'production',files,projectSettings:{framework:'nextjs',rootDirectory:'apps/web',buildCommand:'npm run build --workspace=@greenagain/web',installCommand:'cd ../.. && npm ci',sourceFilesOutsideRootDirectory:true,nodeVersion:'22.x'}})});
const result=await response.json();if(!response.ok){console.error(JSON.stringify({status:response.status,error:result.error}));process.exitCode=1;}else console.log(JSON.stringify({id:result.id,url:result.url,readyState:result.readyState}));
