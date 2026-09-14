import { LangSmithClient } from '../../integrations/src/langsmith.js';
import type { Verification } from './contracts.js';
import type { Releases, SupportOutput } from './aws.js';

export const DATASET_VERSION = 'greenagain-protected-v1';

export interface ProtectedCase {
  id: string;
  orderId: string;
  message: string;
  expectedDecision: 'eligible' | 'ineligible' | 'needs_review';
  expectedPolicyId: string;
}

// Deliberately duplicated protected facts. Do not derive these from the monitored application.
export const CASES: readonly ProtectedCase[] = [
  { id: 'case-1001', orderId: 'ord-1001', message: 'My headphones arrived damaged', expectedDecision: 'eligible', expectedPolicyId: 'returns-standard-v1' },
  { id: 'case-1002', orderId: 'ord-1002', message: 'Can I return my keyboard?', expectedDecision: 'ineligible', expectedPolicyId: 'returns-standard-v1' },
  { id: 'case-1003', orderId: 'ord-1003', message: 'My monitor arrived damaged', expectedDecision: 'eligible', expectedPolicyId: 'returns-standard-v1' },
  { id: 'case-1004', orderId: 'ord-1004', message: 'My camera arrived damaged', expectedDecision: 'ineligible', expectedPolicyId: 'returns-standard-v1' },
  { id: 'case-1005', orderId: 'ord-1005', message: 'My tablet arrived damaged', expectedDecision: 'ineligible', expectedPolicyId: 'returns-standard-v1' },
  { id: 'case-1006', orderId: 'ord-1006', message: 'My mouse arrived damaged', expectedDecision: 'ineligible', expectedPolicyId: 'returns-standard-v1' },
  { id: 'case-1007', orderId: 'ord-1007', message: 'Can I return my lamp?', expectedDecision: 'ineligible', expectedPolicyId: 'returns-standard-v1' },
  { id: 'case-1008', orderId: 'ord-1008', message: 'My headset arrived damaged', expectedDecision: 'eligible', expectedPolicyId: 'returns-standard-v1' },
  { id: 'case-1009', orderId: 'ord-1009', message: 'My router arrived damaged', expectedDecision: 'eligible', expectedPolicyId: 'returns-standard-v1' },
  { id: 'case-1010', orderId: 'ord-1010', message: 'My printer arrived damaged', expectedDecision: 'ineligible', expectedPolicyId: 'returns-standard-v1' },
  { id: 'case-1011', orderId: 'ord-1011', message: 'My phone arrived damaged', expectedDecision: 'eligible', expectedPolicyId: 'returns-standard-v1' },
  { id: 'case-1012', orderId: 'ord-1012', message: 'Can I return my desk?', expectedDecision: 'ineligible', expectedPolicyId: 'returns-standard-v1' },
];
export const UNKNOWN_CASE: ProtectedCase = { id: 'case-unknown', orderId: 'ord-9999', message: 'Please check this order', expectedDecision: 'needs_review', expectedPolicyId: '' };

export interface CaseResult { pass: boolean; reason?: string; traceId?: string; observedVersion?: string; }

export function checkCase(output: SupportOutput, testCase: ProtectedCase, expectedVersion: string): CaseResult {
  if (!output || typeof output !== 'object') return { pass: false, reason: 'malformed invocation output' };
  if (output.error) return { pass: false, reason: `invocation error: ${output.error}`, traceId: output.traceId, observedVersion: output.executedVersion };
  if (typeof output.decision !== 'string' || typeof output.orderId !== 'string' || typeof output.policyId !== 'string' || typeof output.explanation !== 'string' || !Array.isArray(output.toolCalls)) return { pass: false, reason: 'malformed support output', traceId: output.traceId, observedVersion: output.executedVersion };
  if (output.executedVersion !== expectedVersion) return { pass: false, reason: `expected version ${expectedVersion}, observed ${output.executedVersion}`, traceId: output.traceId, observedVersion: output.executedVersion };
  if (output.orderId !== testCase.orderId) return { pass: false, reason: `expected order ${testCase.orderId}, observed ${output.orderId}`, traceId: output.traceId, observedVersion: output.executedVersion };
  if (output.decision !== testCase.expectedDecision) return { pass: false, reason: `expected decision ${testCase.expectedDecision}, observed ${output.decision}`, traceId: output.traceId, observedVersion: output.executedVersion };
  if (testCase.expectedDecision !== 'needs_review' && output.policyId !== testCase.expectedPolicyId) return { pass: false, reason: `expected policy ${testCase.expectedPolicyId}, observed ${output.policyId}`, traceId: output.traceId, observedVersion: output.executedVersion };
  if (!output.explanation.trim()) return { pass: false, reason: 'missing explanation', traceId: output.traceId, observedVersion: output.executedVersion };
  const tool = new Map(output.toolCalls.filter(value => value && typeof value === 'object').map(value => [value.name, value.status]));
  if (testCase.expectedDecision !== 'needs_review' && ['lookup_order', 'read_return_policy', 'check_replacement_eligibility'].some(name => tool.get(name) !== 'ok')) return { pass: false, reason: 'required trusted tool evidence is missing', traceId: output.traceId, observedVersion: output.executedVersion };
  if (testCase.expectedDecision === 'needs_review' && tool.get('lookup_order') !== 'error') return { pass: false, reason: 'unknown order must have a lookup error', traceId: output.traceId, observedVersion: output.executedVersion };
  if (!output.traceId) return { pass: false, reason: 'missing trace id', observedVersion: output.executedVersion };
  return { pass: true, traceId: output.traceId, observedVersion: output.executedVersion };
}

function client(): LangSmithClient {
  const apiKey = process.env.LANGSMITH_API_KEY;
  if (!apiKey) throw new Error('LANGSMITH_API_KEY is not configured');
  return new LangSmithClient({ apiKey, endpoint: process.env.LANGSMITH_ENDPOINT, project: process.env.LANGSMITH_PROJECT });
}

async function awaitTrace(langsmith:LangSmithClient,id:string){
  for(let attempt=0;attempt<5;attempt++){
    try{return await langsmith.getTrace(id);}catch(e){
      if(attempt===4)throw e;
      await new Promise(resolve=>setTimeout(resolve,Number(process.env.GREENAGAIN_TRACE_RETRY_MS??1000)));
    }
  }
}

export async function verify(releases: Releases, expectedVersion: string, qualifier = releases.alias): Promise<Verification> {
  const checkedAt = new Date().toISOString();
  const traceIds: string[] = [];
  let passed = 0;
  let freshPassed = 0;
  let unavailable = false;
  let unknownPassed = false;
  const reasons: string[] = [];
  try {
    const langsmith = client();
    for (const testCase of CASES) {
      let output: SupportOutput;
      try { output = await releases.invoke(testCase.message, testCase.orderId, qualifier, 'evaluation'); }
      catch (error) { unavailable = true; reasons.push(`${testCase.id}: transport/invocation unavailable (${error instanceof Error ? error.message : 'unknown error'})`); continue; }
      const result = checkCase(output, testCase, expectedVersion);
      if (result.traceId) traceIds.push(result.traceId);
      if (!result.traceId) unavailable = true;
      if (result.pass) passed++; else reasons.push(`${testCase.id}: ${result.reason}`);
      if (!result.traceId) continue;
      try {
        await awaitTrace(langsmith,result.traceId);
        await langsmith.createFeedback({ run_id: result.traceId, key: 'greenagain_verification', score: result.pass ? 1 : 0, comment: result.reason ?? 'Protected case passed' });
      } catch (error) { unavailable = true; reasons.push(`${testCase.id}: LangSmith unavailable (${error instanceof Error ? error.message : 'unknown error'})`); }
    }
    let unknown: SupportOutput;
    try { unknown = await releases.invoke(UNKNOWN_CASE.message, UNKNOWN_CASE.orderId, qualifier, 'evaluation'); }
    catch (error) { unavailable = true; reasons.push(`unknown order: transport/invocation unavailable (${error instanceof Error ? error.message : 'unknown error'})`); unknown = undefined as never; }
    if (unknown) { const result = checkCase(unknown, UNKNOWN_CASE, expectedVersion); if (result.traceId) { traceIds.push(result.traceId); try { await awaitTrace(langsmith,result.traceId); await langsmith.createFeedback({ run_id: result.traceId, key: 'greenagain_verification_unknown', score: result.pass ? 1 : 0 }); } catch (error) { unavailable = true; reasons.push(`unknown order: LangSmith unavailable (${error instanceof Error ? error.message : 'unknown error'})`); } } else unavailable = true; unknownPassed = result.pass; if (!result.pass) reasons.push(`unknown order: ${result.reason}`); }
    for (let i = 0; i < 3; i++) {
      if (i) { const configured = Number(process.env.GREENAGAIN_FRESH_SPACING_MS ?? 1000); await new Promise(resolve => setTimeout(resolve, Number.isFinite(configured) ? Math.max(0, Math.min(configured, 10_000)) : 1000)); }
      let fresh: SupportOutput;
      try { fresh = await releases.invoke('My headphones arrived damaged', 'ord-1001', qualifier, 'evaluation'); }
      catch (error) { unavailable = true; reasons.push(`fresh-${i + 1}: transport/invocation unavailable (${error instanceof Error ? error.message : 'unknown error'})`); continue; }
      const result = checkCase(fresh, CASES[0], expectedVersion);
      if (result.traceId) traceIds.push(result.traceId);
      if (!result.traceId) unavailable = true;
      if (result.pass) freshPassed++; else reasons.push(`fresh-${i + 1}: ${result.reason}`);
      if (result.traceId) { try { await awaitTrace(langsmith,result.traceId); await langsmith.createFeedback({ run_id: result.traceId, key: 'greenagain_verification_fresh', score: result.pass ? 1 : 0 }); } catch (error) { unavailable = true; reasons.push(`fresh-${i + 1}: LangSmith unavailable (${error instanceof Error ? error.message : 'unknown error'})`); } }
    }
  } catch (error) {
    reasons.push(`verification unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
    return { status: 'INCONCLUSIVE', datasetVersion: DATASET_VERSION, executedVersion: expectedVersion, total: CASES.length, passed, freshPassed, checkedAt, detail: reasons.join('; '), traceIds };
  }
  const status = unavailable ? 'INCONCLUSIVE' : passed === CASES.length && freshPassed === 3 && unknownPassed ? 'PASS' : 'FAIL';
  return { status, datasetVersion: DATASET_VERSION, executedVersion: expectedVersion, total: CASES.length, passed, freshPassed, checkedAt, detail: reasons.length ? reasons.join('; ') : 'All protected cases and fresh alias invocations passed', traceIds };
}
