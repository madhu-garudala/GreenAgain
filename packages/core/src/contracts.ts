import { createHash } from 'node:crypto';
import { z } from 'zod';

export const State = z.enum(['DETECTED','INVESTIGATING','ACTION_PROPOSED','AWAITING_APPROVAL','REMEDIATING','VERIFYING','FIX_READY','RESOLVED','ESCALATED']);
export type State = z.infer<typeof State>;
const transitions: Record<State, State[]> = {
  DETECTED:['INVESTIGATING','ESCALATED'], INVESTIGATING:['ACTION_PROPOSED','ESCALATED'],
  ACTION_PROPOSED:['REMEDIATING','AWAITING_APPROVAL','ESCALATED'], AWAITING_APPROVAL:['REMEDIATING','ESCALATED'],
  REMEDIATING:['VERIFYING','FIX_READY','ESCALATED'], VERIFYING:['RESOLVED','ESCALATED'],
  FIX_READY:['AWAITING_APPROVAL','ESCALATED'], RESOLVED:[], ESCALATED:[],
};
export const Verification = z.object({status:z.enum(['PASS','FAIL','INCONCLUSIVE']),datasetVersion:z.string(),executedVersion:z.string(),total:z.number(),passed:z.number(),freshPassed:z.number(),checkedAt:z.string(),detail:z.string(),traceIds:z.array(z.string())});
export type Verification = z.infer<typeof Verification>;
export const Release = z.object({version:z.string().regex(/^\d+$/),releaseId:z.string(),commitSha:z.string(),artifactHash:z.string(),verifiedAt:z.string().optional(),verification:Verification.optional()});
export type Release = z.infer<typeof Release>;
export const Proposal = z.object({kind:z.literal('rollback_release'),functionName:z.string(),alias:z.string(),fromVersion:z.string(),targetVersion:z.string(),aliasRevision:z.string(),evidenceIds:z.array(z.string()).min(1),expectedEffect:z.string()});
export type Proposal = z.infer<typeof Proposal>;
export const Decision = z.object({specialist:z.enum(['release_recovery','code_repair','escalate']),hypothesis:z.string(),evidenceIds:z.array(z.string()),missingEvidence:z.array(z.string())});
export type Decision = z.infer<typeof Decision>;
export type Evidence = {id:string;traceId:string;releaseId:string;version:string;deploymentRevision?:string;summary:string;observedAt:string;input:{message:string;orderId:string};output:unknown};
export type Incident = {id:string;fingerprint:string;app:string;environment:string;releaseId:string;state:State;revision:number;createdAt:string;updatedAt:string;summary:string;evidence:Evidence[];decision?:Decision;proposal?:Proposal;actionHash?:string;verification?:Verification;slackThread?:string;slackChannel?:string;notificationError?:string};
export type Event = {id:string;type:string;message:string;createdAt:string;actor:string;link?:string};
export function hash(value:unknown):string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export function transition(incident:Incident,next:State,verification=incident.verification):Incident {
  if(!transitions[incident.state].includes(next)) throw new Error(`Illegal transition ${incident.state} -> ${next}`);
  if(next==='RESOLVED' && (verification?.status!=='PASS'||verification.passed!==verification.total||verification.total<12||verification.freshPassed!==3)) throw new Error('Resolution requires independent protected verification');
  return {...incident,state:next,verification,revision:incident.revision+1,updatedAt:new Date().toISOString()};
}
export function checkRollback(proposal:Proposal,baseline:Release,current:{version:string;revision:string},allow:{functionName:string;alias:string}):void {
  Proposal.parse(proposal); Release.parse(baseline);
  if(proposal.functionName!==allow.functionName||proposal.alias!==allow.alias)throw new Error('Target outside allowlist');
  if(proposal.fromVersion!==current.version||proposal.aliasRevision!==current.revision)throw new Error('Stale deployment; rollback refused');
  if(proposal.targetVersion!==baseline.version||!baseline.verifiedAt||baseline.verification?.status!=='PASS'||baseline.verification.passed!==baseline.verification.total||baseline.verification.total<12||baseline.verification.freshPassed!==3)throw new Error('Target is not a verified baseline');
  if(proposal.targetVersion===proposal.fromVersion)throw new Error('Rollback target equals current release');
}
export function incidentDto(i:Incident){return {id:i.id,title:'Support-agent behavior regression',application:i.app,environment:i.environment,status:i.state,createdAt:i.createdAt,updatedAt:i.updatedAt,summary:i.summary,release:i.releaseId,category:i.decision?.specialist,evidenceCount:i.evidence.length,verification:i.verification};}
