import { z } from 'zod';
import { Store } from './store.js';
import { Releases } from './aws.js';
import { Decision,Proposal,checkRollback,hash,transition,type Incident,type Release } from './contracts.js';
import { reason } from './model.js';
import { required } from './runtime.js';
import { verify } from './verifier.js';
import { SlackClient } from '@greenagain/integrations';

export async function investigate(store:Store,id:string){
  let incident=await store.get<Incident>(`INCIDENT#${id}`);if(!incident)throw new Error('Incident missing');
  if(['RESOLVED','ESCALATED','FIX_READY','AWAITING_APPROVAL'].includes(incident.state))return;
  const releases=new Releases();
  const advance=async(state:Incident['state'],message:string,extras:Partial<Incident>={},actor='worker')=>{const next={...transition(incident!,state),...extras};await store.save(incident!,next,'state_changed',message,actor);incident=next;};
  const patch=async(extras:Partial<Incident>,type:string,message:string)=>{const next={...incident!,...extras,revision:incident!.revision+1,updatedAt:new Date().toISOString()};await store.save(incident!,next,type,message);incident=next;};
  const notify=async()=>{
    if(!process.env.SLACK_CHANNEL_ID){await store.event(id,'notification_pending','Slack channel is not configured.');return;}
    try{const slack=new SlackClient({botToken:required('SLACK_BOT_TOKEN'),signingSecret:process.env.SLACK_SIGNING_SECRET||''});const text=`GreenAgain incident ${id}: ${incident!.state}\n${incident!.summary}${incident!.verification?`\nVerification: ${incident!.verification.status}, ${incident!.verification.passed}/${incident!.verification.total} protected cases, ${incident!.verification.freshPassed}/3 fresh checks.`:''}`;
      if(incident!.slackThread)await slack.updateThread(incident!.slackChannel!,incident!.slackThread,text);
      else{const r=await slack.createThread(process.env.SLACK_CHANNEL_ID,text);await patch({slackThread:r.ts,slackChannel:r.channel},'notification_sent','Slack incident thread created.');}
    }catch{await store.event(id,'notification_pending','Slack delivery failed; recovery state remains recorded.');}
  };
  try{
    if(incident.state==='DETECTED'){await advance('INVESTIGATING','Inspecting failed trace, deployed release, repository, and verified baseline.');await notify();}
    if(incident.state==='INVESTIGATING'){
      const baseline=await store.get<Release>('BASELINE');if(!baseline)throw new Error('No independently verified baseline');
      const current=await releases.current();if(current.version!==incident.evidence[0].version)throw new Error('Incident release is no longer current');
      const input=incident.evidence[0].input;
      const [candidate,control]=await Promise.all([releases.invoke(input.message,input.orderId,current.version),releases.invoke(input.message,input.orderId,baseline.version)]);
      const repo=required('GITHUB_REPOSITORY');
      let response=await fetch(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(baseline.commitSha)}`,{headers:{authorization:`Bearer ${required('GITHUB_TOKEN')}`,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
      const sourcePublished=response.status!==404;
      if(!sourcePublished)response=await fetch(`https://api.github.com/repos/${repo}/commits/main`,{headers:{authorization:`Bearer ${required('GITHUB_TOKEN')}`,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error(`GitHub release source unavailable HTTP ${response.status}`);
      const commit=await response.json() as {sha:string;html_url:string;files?:{filename:string;patch?:string}[]};
      const evidence={traces:incident.evidence.map(e=>({id:e.id,summary:e.summary,output:e.output})),candidate,baseline:{version:baseline.version,verification:baseline.verification,output:control},current,repository:{commitSha:commit.sha,url:commit.html_url,sourcePublished,limitation:sourcePublished?null:'Deployed source commit is local and not yet published. Repository head is historical; do not treat its diff as the deployed change. Recovery may rely only on reproduced version behavior and independently verified baseline.',files:sourcePublished?commit.files?.filter(f=>f.filename.startsWith('apps/monitored-agent/')).map(f=>({path:f.filename,diff:f.patch?.slice(0,12000)})):[]}};
      const decision=await reason('orchestrator','Choose release_recovery when the same operation fails on current version and works on verified baseline; code_repair for a source/tool adapter failure needing a patch; otherwise escalate. Output specialist, hypothesis, evidenceIds, missingEvidence.',evidence,Decision);
      if(decision.result.evidenceIds.some(e=>!incident!.evidence.some(x=>x.id===e)))throw new Error('Reasoning cited unknown evidence');
      await patch({decision:decision.result},'specialist_dispatched',`${decision.result.specialist}: ${decision.result.hypothesis}`);
      await store.put(`INCIDENT#${id}`,decision,'DECISION#orchestrator');
      if(decision.result.specialist!=='release_recovery'){await advance('ESCALATED',decision.result.specialist==='code_repair'?'Code repair identified; isolated repair runner is not yet enabled.':'Evidence does not support an automated recovery.');await notify();return;}
      const specialist=await reason('release recovery specialist','Propose rollback_release using only the supplied functionName, alias, current version/revision and verified baseline version. Copy exact evidence IDs. Return kind,functionName,alias,fromVersion,targetVersion,aliasRevision,evidenceIds,expectedEffect.',{...evidence,functionName:releases.functionName,alias:releases.alias},Proposal);
      checkRollback(specialist.result,baseline,current,releases);
      await store.put(`INCIDENT#${id}`,specialist,'DECISION#release');
      await advance('ACTION_PROPOSED','Release specialist proposed restoring the measured baseline.',{proposal:specialist.result,actionHash:hash(specialist.result)},'release_recovery');
    }
    if(incident.state==='ACTION_PROPOSED'){
      const baseline=await store.get<Release>('BASELINE');if(!baseline||!incident.proposal)throw new Error('Action context missing');
      checkRollback(incident.proposal,baseline,await releases.current(),releases);
      await store.put(`INCIDENT#${id}`,{hash:incident.actionHash,proposal:incident.proposal,status:'INTENT',at:new Date().toISOString()},'ACTION');
      await advance('REMEDIATING','Policy accepted the exact target and alias revision. Action intent persisted.');
    }
    if(incident.state==='REMEDIATING'){
      const proposal=incident.proposal!;const current=await releases.current();
      if(current.version===proposal.targetVersion){await store.event(id,'action_observed','Alias already points to the intended baseline; reconciling before verification.');}
      else{const baseline=await store.get<Release>('BASELINE');if(!baseline)throw new Error('Baseline missing');checkRollback(proposal,baseline,current,releases);await releases.update(proposal.targetVersion,proposal.aliasRevision);}
      const observed=await releases.current();if(observed.version!==proposal.targetVersion)throw new Error('Alias changed during recovery');
      await store.put(`INCIDENT#${id}`,{hash:incident.actionHash,proposal,status:'OBSERVED',version:observed.version,revision:observed.revision,at:new Date().toISOString()},'ACTION');
      await advance('VERIFYING',`AWS alias now targets version ${observed.version}; running independent fresh verification.`);await notify();
    }
    if(incident.state==='VERIFYING'){
      const verification=await verify(releases,incident.proposal!.targetVersion);
      const final=verification.status==='PASS'?'RESOLVED':'ESCALATED';
      await patch({verification},'verification_completed',`${verification.status}: ${verification.passed}/${verification.total} protected cases, ${verification.freshPassed}/3 fresh checks.`);
      await advance(final,final==='RESOLVED'?'Fresh deployed behavior passed the protected recovery gate.':'Recovery could not be independently verified.');await notify();
    }
  }catch(e){
    if(!['RESOLVED','ESCALATED'].includes(incident!.state)){const message=e instanceof Error?e.message:'Recovery processing failed';await advance('ESCALATED',message,{summary:message});await notify();}
    else throw e;
  }
}
