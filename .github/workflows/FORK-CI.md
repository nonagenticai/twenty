# Fork CI policy (nonagenticai/twenty)

This repository is a **public fork of `twentyhq/twenty`** that we actually deploy: namespace
`twenty`, image hand-pinned (`v2.9.0-sso2`), not Flux-automated. It inherits all 39 of upstream
Twenty's workflow files. Some of them can never succeed here, and some are signal we want to
keep. The distinction below is the whole point of this document.

## The guard

Workflows that must not gate this fork carry, on **every** job:

```yaml
if: github.repository == 'twentyhq/twenty'
```

On a push to `main` the workflow still runs, every job skips, and the run concludes `skipped` —
which our fleet CI gate accepts alongside `success`. Where a job already had an `if:`, the guard
is ANDed in and the original expression is preserved verbatim and parenthesised.

**Why guard instead of deleting the files?** GitHub keeps a workflow *active* while its file
exists on **any** branch, and this fork carries ~1112 inherited upstream branches that still
contain them. Deleting from `main` leaves the workflow active with its last **failed** run still
the newest completed run on `main` — it looks like a fix and changes nothing. Only a new run
concluding `skipped` replaces that failure. Disabling via the Actions API is also rejected: it is
an invisible repo setting rather than a reviewable decision in git.

## Guarded — cannot possibly work here

`cd-deploy-main.yaml`, `app-prod-parity-e2e-dispatch.yaml`

Both mint a token with `actions/create-github-app-token` for `twentyhq`-owned **private** repos
(`twenty-infra`, `ci-privileged`) via `vars.TWENTY_WORKFLOW_DISPATCHER_CLIENT_ID`. Every run died
with `The 'client-id' (or deprecated 'app-id') input must be set to a non-empty string.` This fork
cannot possess that GitHub App. Structural — no secret fixes it.

## Guarded — real, but flaky upstream product tests

`ci-e2e-main.yaml`

This suite exercises upstream Twenty **product** behaviour that we do not maintain and would
never fix. It is also measurably flaky here: on one commit of PR #6 it concluded `success`, and
on the very next commit — same suite, same code under test — it failed with

```
❌ › chrome › create-record.spec.ts › Create and update record   (x2)
❌ › chrome › workflow-creation.spec.ts › Create workflow        (x3)
```

while self-reporting `login.setup.ts` and `create-kanban-view.spec.ts` as flaky. Gating `main` on
it would leave `main` red roughly half the time on tests we do not own. A permanently-flapping
gate is worse than no gate: it trains people to ignore red, which is exactly the failure this
policy exists to remove.

The `runs-on: ubuntu-latest` fix below is **kept** in that file so it is correct if anyone ever
re-enables it.

## Deliberately NOT guarded — keep these red-able

- **`ci-front.yaml`, `ci-server.yaml`** and the rest of the `CI *` suites — they cover this
  fork's own changes and they pass on `ubuntu-latest`. Real signal. Leave them live.
- **`ci-blocked-contributors.yaml`** — see below. It is a legitimate repo rule that works exactly
  as intended. Guarding it would be gaming the check. We comply instead.

## Runner SKU: `ubuntu-latest`, never ANY `ubuntu-latest-N-cores`

Upstream requests the larger-runner SKU `ubuntu-latest-8-cores` (`ci-e2e-main.yaml`,
`ci-front.yaml`). That SKU is **not available to this org**: those jobs were created, never picked
up by any runner, and cancelled by GitHub after exactly 24h with `steps: []`. After switching to
`ubuntu-latest` the same jobs claimed a runner within seconds. Keep `ubuntu-latest`; widen it only
if the org is granted larger runners. 

⚠️ **This rule is about the SKU FAMILY, not one label.** It originally named only
`ubuntu-latest-8-cores`, and `ci-create-app-e2e-minimal.yaml` kept `ubuntu-latest-4-cores`
for months as a result. Measured 2026-08-25: that job had **never once executed** in this
fork — its path filter usually skipped it, and on the two occasions it was selected
(`feat/admin-panel-provisioning-mutations` 10:36Z, `main` 11:41Z) it sat `queued` with
`steps: []` for hours. Worse, `ci-create-app-e2e-minimal-status-check` reported **success**
on the skip, so the gate was green while the E2E had never run. Grep for
`ubuntu-latest-[0-9]*-cores`, not for a specific width. The two `STORYBOOK_BUILD_CACHE_KEY_*` env strings in
`ci-front.yaml` embed the runner name and were renamed to match (cache-key rename only).

## No AI-bot attribution in commits

`ci-blocked-contributors.yaml` (PR-only — it never runs on `main`) fails any PR whose commits are
attributed to a blocked bot:

```
Commit <sha> is attributed to a blocked contributor (matched: @anthropic.com)
```

`packages/twenty-server/scripts/check-blocked-contributors.ts` matches its patterns against the
author name/email, the committer name/email, **and the full commit message** — so a
`Co-Authored-By:` trailer naming an Anthropic address fails, and so does merely quoting that
address in the message body. Commits here must carry neither, even where other repos in this org
ask for such a trailer.

## Sibling decision

`PUBLISHING.md` on the `rmt/twenty-sdk-skip-build` branch — which is this repo's default branch,
**deliberately**. Do not change the default branch.
