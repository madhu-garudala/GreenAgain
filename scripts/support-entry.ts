import { loadRuntime } from '../packages/core/src/runtime.js';
import { supportHandler as run, type LambdaInput } from '../apps/monitored-agent/src/index.js';
export async function supportHandler(input:LambdaInput){await loadRuntime();return run(input);}
