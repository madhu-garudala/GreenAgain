# Reliability brief

## What is implemented

The web dashboard has explicit loading, unavailable, and preview states; accepts the control-plane DTO shapes; maps persisted `state` to the UI `status`; and guards polling responses so an old incident cannot overwrite a newly selected one. Action controls distinguish an in-flight request from a completed message.

The repository includes a CI workflow that installs the committed dependency graph with Node.js 22, then runs workspace typechecks, tests, and builds. CI is validation only and has no deployment permissions.

## What is not yet evidenced

There is no measured cloud recovery run in this snapshot. In particular, there is not yet evidence of a deployed monitored agent, LangSmith-derived detection, durable queue delivery, Slack incident notification, AWS release rollback, independent protected evaluation, or a verified `RESOLVED` incident. Preview fixtures and deterministic tests must not be presented as those outcomes.

## Acceptance evidence to collect

- Healthy and faulty immutable releases, with fresh request measurements.
- A persisted incident and deduplicated job from real trace evidence.
- A specialist decision tied to exact evidence IDs and an allowed target.
- An action ledger entry with revision and stale-state checks.
- Independent verification using fresh requests and protected cases.
- Failure-path evidence showing `INCONCLUSIVE` or `ESCALATED` when recovery does not pass.
- CI logs for the exact commit and deployment logs for the approved environment.

Until those artifacts exist, the project status is implementation-in-progress rather than production-ready.
