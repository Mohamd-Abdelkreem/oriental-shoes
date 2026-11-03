# Working in this repository

Before planning, task generation, implementation, refactoring or review:

1. Read the [constitution](.specify/memory/constitution.md) and
   [engineering index](docs/engineering/README.md). At a phase's initial intake,
   read the nine core engineering guides listed there; for later batches, revisit
   every guide mapped to the affected boundaries and inspect actual source/callers.
2. For Spec Kit work, follow [phase delivery](docs/workflow/phase-delivery.md).
   For roadmap delivery, resolve the selected phase, feature directory and authorized
   command/task scope before writing. Project-wide governance/documentation needs no
   invented product phase or feature selection. Existing root `plan.md` is the
   protected Oriental Shoes roadmap; `specs/<feature>/plan.md` is a selected feature's
   technical plan. Preserve roadmap phase IDs, current owner-review status and
   client-input gates. Do not regenerate the roadmap or treat documentation adoption
   as approval to implement it.
3. Inspect Git status and preserve existing edits. Read manifests/configuration
   before naming commands, versions, paths or installed capabilities.

Explicit current user instructions govern the requested work. The constitution
governs engineering; accepted requirements govern product intent; owning guides
govern implementation. Source and fresh checks establish current reality. Report
conflicts rather than silently changing policy or treating old code as a precedent.

## Implementation and review

Oriental Shoes has existing Arabic/RTL/Cairo screens, dialogs and print surfaces.
Preserve them. Real auth/account behavior coexists with operational browser-local
MVP state; only actual backend evidence establishes persisted domain authority.
Files under `features/prototype/` include reached product UI and must not be removed
because of their name. Historical migration audits do not override current source,
the accepted roadmap or explicit owner decisions.

- Assume the implementation model has limited reasoning/context. PLAN/TASKS must
  produce the detailed blueprint and bounded task briefs defined in
  [implementation handoff](docs/workflow/implementation-handoff.md). Before code
  edits, IMPLEMENT verifies the selected briefs and current source; unresolved
  material behavior/interface/design decisions block dependent implementation.
- Follow the canonical module/feature recipes in the owning guides. Reuse existing
  auth, transport, QueryClient, validation, errors and persistence boundaries.
- Complete and verify required backend work before its dependent frontend wiring.
  Preserve approved design; necessary functional changes remain within scope.
- Create or extend discovered test files for changed behavior and verify the actual
  boundary being claimed. Use [testing](docs/engineering/testing.md) to choose checks.
- Review against [code review](docs/engineering/code-review.md) before reporting
  completion. Requirements and engineering quality need separate assessments.
- Use matching installed skills when available; the checked-in guides also support
  direct review without global skill installation. Report missing tools/evidence.
- Keep technical artifacts in English; follow the user's language in conversation
  and the accepted product language/direction in UI.

## Change boundaries

Honor authorization already present in the request. Complete necessary in-scope
work without asking again at routine batch boundaries. A command's next-step
suggestion is not authorization for another command or phase. Preserve analysis
and convergence write limits from the workflow guide. Commit/push, deployment,
destructive data actions and external messages need authorization covering them.

For Next.js changes, also read [web instructions](apps/web/AGENTS.md) and relevant
installed guides under `apps/web/node_modules/next/dist/docs/` before depending on
framework behavior. Follow [the walkthrough](docs/engineering/integration-walkthrough.md)
when tracing a complete existing contract → database → API → QueryClient → UI flow.
