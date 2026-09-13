# Operations

GreenAgain is not deployed from this repository yet. No cloud resources, worker, database, scheduled poller, Vercel project, or production incident loop has been provisioned in the current snapshot. Treat all operational commands below as a planned runbook, not evidence that the system is live.

## Before first deployment

1. Restore credentials through a private secret manager or deployment settings. Never commit `.env.local` or credentials.
2. Install with the committed lockfile using Node.js 22 and `npm ci`.
3. Run `npm run typecheck`, `npm test`, and `npm run build`.
4. Deploy the web app to the approved Vercel project and verify same-origin API routes and operator authentication.
5. Provision the separately reviewed AWS/DynamoDB/SQS/Lambda/ECS infrastructure. The web UI must not depend on a laptop process.
6. Perform read-only integration checks, then a controlled end-to-end recovery test with a disposable release.

## Incident operation

The dashboard is an observation and control surface. A status of `RESOLVED` is only trustworthy when the independent verifier has recorded `PASS`; an API success response or alias update alone is insufficient. `FIX_READY` means a tested repair is available for review, not that it was deployed.

If the control API is unavailable, the UI labels the data unavailable and does not imply production health. `?preview=1` is a clearly labeled fixture mode and is not a live incident source.

## Recovery and rollback

Before authorizing an action, verify the exact incident revision, current release, target release, action hash, and operator identity. Record the action and its verification result durably. On failed or inconclusive fresh checks, keep the incident unresolved and escalate; do not retry blindly or claim recovery.

## Current evidence

The only verified web check in this snapshot is the web workspace TypeScript check. Cloud deployment, external-provider protocol behavior, production monitoring, and recovery reliability remain pending.
