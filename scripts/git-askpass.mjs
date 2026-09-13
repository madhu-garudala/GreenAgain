#!/usr/bin/env node
const username=/username/i.test(process.argv[2]||'');
process.stdout.write(username?'x-access-token':(process.env.GITHUB_TOKEN||process.env.Github_API_KEY||''));
