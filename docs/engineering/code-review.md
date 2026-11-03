# Review procedure and acceptance

Use this procedure after each implementation batch, during a standalone review and
at phase acceptance. Review the same standards used to write code. Command authority
comes from [phase delivery](../workflow/phase-delivery.md): a review does not expand
its permitted writes or authorize another phase.

## 1. Establish coverage

Resolve the actual review scope: selected feature/task IDs, working-tree changes or
revision range. Inspect Git status and name included staged/unstaged/untracked work.
Read complete in-scope files and relevant callers, contracts, persistence and consumers.
A diff fragment alone cannot establish dependency direction or a complete error path.

Read accepted requirements, the constitution, [engineering index](README.md) and
applicable guide sections. Record the scope and revision/state in the existing feature
evidence or response. Name unread/excluded paths. Without a feature spec, use the user
request and established behavior/contracts; do not invent product requirements.

Completion criterion: every in-scope responsibility has a known owner and review route.

For a pre-implementation artifact review, also apply
[implementation handoff](../workflow/implementation-handoff.md). Check the concrete
operation blueprints and each applicable task brief, including current interfaces,
ordered steps, failure/cache/data choices and test expectations. Requirements-quality
approval alone does not establish an implementation-ready design. Report missing
material decisions as readiness gaps; an artifact-review PASS is not an executed
test result. During post-edit review, compare code with these accepted decisions as
well as requirements and engineering rules; do not turn permitted routine coding
choices into invented constraints.

## 2. Trace the behavior and engineering rules

Assess two dimensions separately:

| Dimension             | Questions                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Requirements          | Does the actual behavior satisfy accepted actors, inputs, outcomes, exclusions and failure criteria?               |
| Engineering standards | Does it follow the documented ownership, types, style, contracts, data, security, frontend and verification rules? |

For each material operation, trace input → validation → authority → service → query/
transaction/provider → safe projection → HTTP → feature API → query/cache → UI and
its failure path, omitting genuinely unused capabilities. Check the applicable sections:

- [Code style](code-style.md): names, cohesion, module pattern, strict types,
  dependency direction, useful reuse, dead code and bounded work.
- [Backend](backend-standard.md): thin HTTP adapters, explicit composition, service
  invariants, side-effect failure ownership and lifecycle.
- [Contracts](api-contracts.md): one executable schema, exact wire/error semantics,
  runtime boundary validation and coordinated producer/consumer changes.
- [Data](data-patterns.md): selection/mapping, bounds/indexes, actual constraints,
  atomicity, races/retries and existing-data migration safety.
- [Security](security.md): current server authority, safe fields, credentials,
  private data, untrusted input and deployment assumptions.
- [Frontend](frontend-standard.md): approved presentation, truthful states,
  QueryClient ownership, cache/drafts/access, accessibility and client boundaries.
- [Testing](testing.md): real discovered cases at the claimed boundary, meaningful
  assertions, resource isolation/cleanup and actual executed evidence.

Passing tests does not waive an applicable architecture or security violation. An old
neighboring shortcut is not permission to copy it into a new feature. Preferences
without a documented rule or concrete correctness/maintenance risk are not blockers.

Completion criterion: applicable guides have concrete findings or an observed clean pass.

## 3. Record findings and evidence

Use the existing plan/tasks/evidence owner or the response. A separate report file is
not required for every batch. A compact coverage table is sufficient:

| Guide/section             | Files or boundary     | Verdict                             | Evidence or capability reason                |
| ------------------------- | --------------------- | ----------------------------------- | -------------------------------------------- |
| Actual applicable section | Actual reviewed owner | PASS / BLOCKED / NOT REVIEWED / N/A | Observation, check, gap or unused capability |

`N/A` needs a capability reason. `NOT REVIEWED` means unknown, not passed. `PASS`
requires observation and the evidence appropriate to the claim. `BLOCKED` identifies
an unresolved mandatory correction, evidence gap or necessary product decision.

Every actionable finding includes current file/line, owning rule/requirement, impact,
smallest adequate correction and how to verify it. Classify existing out-of-scope
issues separately; neither silently waive them nor start an unrelated refactor.

Use installed matching skills when available: production code, tests, technical docs,
React or security skills according to their actual scopes. Read and perform the skill,
fix in-scope findings when authorized and report unavailable tools. Merely naming a
skill is not a pass. Direct review through these guides remains supported after clone.

## 4. Verify, correct and close the authorized scope

Choose focused checks through the testing guide, including affected shared regressions.
At a phase exit, include required full checks and environment-dependent evidence.
During a strictly read-only command, inspect recorded evidence and report missing
checks; do not run an artifact-writing aggregate to manufacture a review pass.

During authorized implementation, fix required in-scope findings and rerun the checks
affected by those fixes. Preserve accepted requirements and meaningful test assertions.
Do not change policy, approval markers or unrelated files to obtain a green result.

For documentation, verify every referenced path, command, symbol, configuration key,
behavior and code sample against its owner. Resolve relative links/anchors, label
proposed paths and snippets, remove stale duplicate explanations, and run formatting.
Verify copied examples with the installed APIs; upstream examples may target another
major version. A source mismatch is an explicit finding, not a guess.

Finish with separate **REQUIREMENTS** and **ENGINEERING STANDARDS** verdicts:
`PASS`, `BLOCKED` or `NOT REVIEWED`. Include actual checks, warnings and unverified
boundaries. Only mark in-scope task completion after both dimensions and required
evidence pass. Distinguish a completed batch from backend, phase and release acceptance.
No local review certifies all future behavior or authorizes deployment/commit/push.
