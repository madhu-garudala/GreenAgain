import { build } from 'esbuild';
for(const [entry,outfile]of [['scripts/support-entry.ts','dist/support/index.js'],['apps/poller/src/index.ts','dist/poller/index.js'],['apps/worker/src/index.ts','dist/worker/index.js'],['apps/worker/src/lambda.ts','dist/worker-lambda/index.js']]){
  await build({entryPoints:[entry],outfile,bundle:true,platform:'node',target:'node22',format:'cjs',sourcemap:true});
}
