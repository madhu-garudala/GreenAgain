import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const r=spawnSync('git',['push','origin','main'],{stdio:'inherit',env:{...process.env,GIT_ASKPASS:resolve('scripts/git-askpass.mjs'),GIT_TERMINAL_PROMPT:'0'}});
process.exitCode=r.status||0;
