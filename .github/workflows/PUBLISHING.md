# Publishing `@nonagentic/twenty-sdk`

**This fork does NOT publish its own SDK.** The workflow that used to live here
(`publish-twenty-sdk.yml`) could never run: `nonagenticai/twenty` is a **public**
fork, and the org's ARC runner groups have `allows_public_repositories: false`
(a GitHub security gate that blocks public/fork repos from the org's self-hosted
`arc-amd64` runners). There is no per-repo allowlist in the ARC scale-set, and
flipping the org-wide toggle would expose privileged DinD runners to every public
repo — so that path is off the table.

## Where publishing happens instead

The publisher lives in the **private, non-fork** repo
**`nonagenticai/gitops-production`**:
`.github/workflows/publish-twenty-sdk.yml`. A job there runs on `arc-amd64`
(private-repo context, so the public-fork gate never applies), checks out this
fork by `ref`, builds `twenty-sdk`, and publishes `@nonagentic/twenty-sdk` to
`https://npm.internal/`.

## How to republish after a `twenty-sdk` change here

1. Bump `packages/twenty-sdk/package.json` `version` (e.g. `2.9.0-rmt.1` →
   `2.9.0-rmt.2`) and push to this fork branch. **Always bump** — a same-version
   content change poisons the yarn metadata cache on consumers (growth).
2. In `nonagenticai/gitops-production`: Actions → **publish-twenty-sdk** → Run
   workflow → `ref` = this fork branch/tag, `dry_run` = `false`.
3. Re-point growth's npm alias (`"twenty-sdk": "npm:@nonagentic/twenty-sdk@<ver>"`)
   to the new version.
