# Phase delivery and Spec Kit command contract

This guide applies the [constitution](../../.specify/memory/constitution.md) to
the checked-in Spec Kit commands. The [engineering index](../engineering/README.md)
owns implementation guidance; this file owns selection, authorization and delivery.
[Implementation handoff](implementation-handoff.md) owns the detailed artifact,
task-brief and stage-specific readiness requirements for the limited implementation
model. Use [the launchers](prompts.md) for requests. Documentation establishes policy,
not an installed executable, a successful check or release approval.

## 1. Resolve the request and roadmap

Read root `AGENTS.md`, applicable nested instructions, the constitution and the
selected command adapter. Inspect Git status and preserve existing edits. Discover
actual scripts, versions and source owners from this checkout. For roadmap commands,
also read root `plan.md` and resolve the phase/feature mapping below. CONSTITUTION
and project-wide documentation maintenance do not require a product roadmap,
`PHASE_ID` or selected feature; apply their authorized scope and skip roadmap-only
selection steps. They may run before the user creates root `plan.md`.

Root `plan.md` is the user's project roadmap. Each phase needs a stable identifier,
observable outcome, deliverables, exclusions, dependencies and exit criteria.
Oriental Shoes already has this protected roadmap; read it in place and preserve its
P01–P08 phase identities. This documentation adoption does not regenerate/reformat
root `plan.md`, approve its recorded draft status or execute any phase. A selected
delivery phase maps to one feature under `specs/`.
`specs/<feature>/plan.md` is that feature's technical implementation plan, generated
by PLAN. These two plans have different responsibilities.

### Oriental Shoes roadmap and client-input gates

The current roadmap records owner review before application implementation. Apply
explicit approval/phase authorization already supplied in the session; do not infer
approval from constitution/docs adoption or ask again when it has actually been given.
Before dependent product work, read the exact selected phase and its current gates.
Read the current status/evidence of client-input rows such as CAT-01/CAT-02, PRC-01,
NUM-01 and OPS-01 from the roadmap; do not copy a cached assumption that every row is
still pending. Preserve each unresolved gate within its recorded scope. These gates
do not block independent work the roadmap admits, but must be satisfied before their
corresponding production action/phase acceptance.
Synthetic test policies do not count as confirmed catalog, pricing or numbering
acceptance. Do not import/activate client data or invent missing values to close a gate.
This documentation work selects no feature, phase or production action.

Resolve `PHASE_ID` from the current request or already supplied session context.
Read the whole roadmap for dependencies, then find the exact phase title and its
existing feature specification. A phase ID, feature-directory prefix, branch name
and internal task-group number are independent identifiers. Record their mapping.
For ordinary maintenance outside roadmap delivery, use the user's request and
current accepted behavior; do not manufacture a phase or change the active feature.

At phase intake read every Markdown guide directly in `docs/engineering/`, starting
with its index. For follow-up batches, revisit the applicable sections and actual
source/callers. Apply optional installed skills by their stated scope; when missing,
perform the corresponding review from the checked-in guides and report that fact.

**Ready when:** the authorized outcome, exclusions, dependency evidence, current
baseline, preserved work and relevant engineering owners are identified.

## 2. Select the feature without guessing

This section applies to roadmap feature commands. Project-wide governance/docs work
does not create or require an active product feature.

`.specify/feature.json` stores the active feature's `feature_directory`. It is
ignored, per-checkout state, so a fresh clone has no selected feature. The checked-in
scripts resolve `SPECIFY_FEATURE_DIRECTORY` before this pointer; inspect conflicting
environment overrides as well as the pointer. Source documents establish which
feature belongs to the requested phase.

- For a new phase, SPECIFY creates one feature and records its relative path in
  the pointer. Let the installed integration assign the feature identifier.
- For existing work, reuse the matching feature and its accepted artifacts. If
  selection is missing or mismatched, selecting that known feature is part of an
  authorized write workflow. Record the corrected mapping before downstream work.
  Do not regenerate its spec or tasks to obtain a clean gate.
- ANALYZE and CONVERGE preserve the pointer and environment selection. Report a
  mismatch and the exact required selection; their authority does not include repair.
- Resolve read-only paths with
  `.specify/scripts/bash/check-prerequisites.sh --json --paths-only`. This path-only
  mode does not persist selection. Other setup/resolution calls can persist an
  environment override, so first verify that it matches the intended feature.

**Ready when:** phase title, feature spec, effective selection and requested command
refer to the same work. A fresh clone can SPECIFY a new phase without precreating
machine-local feature state.

## 3. Use the authorization already supplied

A request for one command runs that command only. An explicitly requested sequence
or whole phase covers its necessary preparation, review, implementation and checks;
continue within that authorization without asking again at routine batch boundaries.
The launcher's placeholders are natural-language bindings, not shell flags.

For IMPLEMENT, resolve the permitted scope to exact task IDs before editing:

- Explicit IDs or a named internal group select those tasks and satisfied prerequisites.
- A selected dependency-safe batch selects the next tasks whose dependencies are met.
- A request to implement or complete the selected phase selects its remaining accepted
  tasks, executed in small dependency-safe batches. `ALL_ACTIVE_PHASE_TASKS` can make
  that intention explicit; the extra token is not required when the request is clear.

Ambiguous scope is a clarification need, not permission for the entire roadmap.
A clear whole-phase request is sufficient authority; do not demand repeated approval
for individual tasks. A necessary missing product decision blocks only dependent work.
Continue independent authorized work while that decision is pending. Consequential
external actions still need authorization covering their action and environment.

Suggested next commands, handoff buttons, extension hooks and internal task groups
do not enlarge the request. Apply this contract before any bundled pre/post hook.
Run only hook actions compatible with the authorized command, write boundary and
environment. Report a conflicting hook instead of invoking it. Read-only commands
cannot execute writing hooks. A requested sequence may include its stated next
command; an isolated command does not automatically start another one or later phase.

## 4. Execute the selected command

The normal phase sequence is SPECIFY → CLARIFY → PLAN → CHECKLIST → TASKS → ANALYZE
→ IMPLEMENT → CONVERGE. Reuse valid completed artifacts. An unnecessary clarification
round or document regeneration is not a required ritual. CONSTITUTION is project-wide
governance, not a step repeated for each phase. TASKSTOISSUES remains a separately
requested external action.

Before hooks/setup/generation for SPECIFY, PLAN or TASKS, inspect existing accepted
artifacts. A repeated command with no authorized change reuses/reports them unchanged.
An authorized amendment updates only affected sections and preserves IDs, decisions,
completed tasks and evidence. Templates start new features or unfinished drafts; they
are not reset instructions for accepted work. `setup-plan.sh` skips an existing plan,
and `setup-tasks.sh` only resolves context/template content without writing tasks.md;
agent generation must preserve those same ownership boundaries. The `setup-plan.sh`
JSON `BRANCH` is a feature-context identifier (`SPECIFY_FEATURE` or the feature-folder
basename), not proof of the current Git branch. Inspect Git separately when reporting
an actual branch.

| Command      | Required work and completion boundary                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CONSTITUTION | Update `.specify/memory/constitution.md` for an authorized policy decision. Record impact and follow-up; changes to other guidance/templates require the separately authorized documentation step.                                                                                                                                                                                                                         |
| SPECIFY      | Reuse the selected phase's existing spec or create one new feature. Define accepted behavior, actors, exclusions, prerequisites, truthful states and measurable acceptance; update its built-in spec-quality checklist. Stop with clear questions or readiness.                                                                                                                                                            |
| CLARIFY      | Inspect repository facts first. Ask only material unresolved product questions, each with the simplest practical recommendation and its consequence. Record accepted answers in the selected spec. Recommendations remain proposals until accepted. If no material questions remain, report that.                                                                                                                          |
| PLAN         | Read current owners and installed framework guidance when relevant. Produce feature technical design, contracts/data model/research/quickstart only where useful. Record all constitution gates before research and after design, actual file owners, dependencies and verification strategy. Planning PASS describes a compliant design and planned evidence; it does not certify implemented behavior or executed tests. |
| CHECKLIST    | Generate/reuse a requirements-quality review artifact for the selected spec/design. Leave new custom review markers unchecked. Assess clarity/completeness/testability of written requirements; future execution acceptance belongs in tasks.                                                                                                                                                                              |
| TASKS        | Preserve accepted task IDs/progress. Generate traceable, dependency-ordered tasks with real file paths, test work, review and exit checks. Reuse existing foundations. Order the required backend group and its acceptance before dependent frontend integration.                                                                                                                                                          |
| ANALYZE      | Read spec/plan/tasks and relevant source to report inconsistencies, coverage gaps and constitutional violations. Modify no files or markers, change no selection, and run no artifact-writing checks.                                                                                                                                                                                                                      |
| IMPLEMENT    | Review requirement quality first, resolve permitted IDs, implement their dependencies in order, write meaningful tests, apply the same engineering review standards and execute appropriate checks. Mark only verified in-scope tasks complete. Report remaining phase boundaries.                                                                                                                                         |
| CONVERGE     | After implementation, compare current in-scope code/evidence with requirements and standards. Its only write is appending unique traceable remediation tasks to the selected `tasks.md`. Preserve prior content/markers, spec/plan/code and selection; execute no tests/builds/formatters. If no gaps remain, leave tasks byte-for-byte unchanged.                                                                         |

### Requirements approval before implementation

A request to implement authorizes evidence-based review of existing requirements
checklists before code work. Read every checklist item the implementation adapter
will scan; mark supported requirements-quality items with concise evidence, retaining
their IDs and wording. Reuse valid prior review. A built-in spec checklist is maintained
by SPECIFY/CLARIFY; repair its underlying spec through the appropriate authorized
step when necessary. Do not silently rewrite accepted product decisions.

Complete this review before starting the implementation outline. During code work
all checklist markers are read-only. `[x]` in a requirements checklist means its
written criterion is satisfied, not that code exists or a test passed. A future
execution check cannot be approved in advance merely to unlock implementation.
Genuine unanswered requirements, analysis blockers or unmet prerequisite gates remain
blocking. There is no proceed-anyway bypass for a mandatory requirement or principle.

### Implementation readiness before code

Apply [the handoff gate](implementation-handoff.md#4-apply-the-readiness-gate-at-the-correct-stage)
at its producing stage. PLAN resolves operation-specific design; TASKS supplies
bounded briefs/context; ANALYZE reviews all in-scope briefs read-only; IMPLEMENT
checks its selected briefs and current source before implementation code edits. Missing material
decisions block dependent work and return to their authorized planning owner.
CHECKLIST reviews available requirements/design before TASKS; future briefs/tests
are pending outputs, not prematurely approved or circular prerequisites.

### Dependency-safe implementation

Reuse the existing workspace, auth/session, transport, contracts, database and test
infrastructure. Setup tasks address an actual missing prerequisite; cloning the
boilerplate does not require reinitializing Spec Kit, rebuilding auth or regenerating
Docs. Ignore/config changes must be justified by this feature's actual artifacts.

Complete, review and verify the entire required backend group before its dependent
frontend: contracts, safe schema/migrations/constraints, authorization, services,
queries/mappers, endpoints, applicable providers and failure behavior. A phase may
contain both groups in one feature. Backend-only work does not wait for an unrelated
UI decision. Existing accepted foundations remain complete.

Preserve approved frontend design and use existing components/tokens. Necessary
functional changes follow the accepted requirements. An absent required product
surface needs an explicit decision; report its exact location and impact. Do not
invent a redesign or hide required failure/success behavior.

Every behavior-changing phase creates or extends actual test files discovered by the
owning runner. Select meaningful coverage by requirement and risk, not file counts.
Run focused and affected shared checks per batch, then full applicable verification
at phase exit. Use real PostgreSQL/Express/component/browser boundaries for the claims
defined in [testing](../engineering/testing.md). Missing infrastructure leaves the
corresponding gate open; it never permits unrelated developer or production data.

Review changed code and callers under [code review](../engineering/code-review.md).
Fix required in-scope findings. Keep requirements and engineering verdicts separate.
A partial batch, mocked response or locally green suite does not establish whole-phase
acceptance or release. Documentation-only work gets link/reference/example/format
checks; root `pnpm verify` formats/generates/builds and is unsuitable for that purpose
or read-only commands.

## 5. Report and resume

Use the existing feature evidence/plan owner instead of creating a report per task.
Record phase/feature mapping, permitted and completed IDs, changed paths, applicable
rules, actual commands/results, warnings, decisions and remaining gates. Separate
fresh checks, matching reused/cached evidence and unperformed work. Report distinct
requirements, engineering, backend, batch, phase and release status where relevant.

On interruption, preserve enough evidence to resume: reviewed revision, completed
tasks, pending work, verification and next action. Reconcile current source and any
unfinished external action before retrying. Continue within the original authorized
scope; a later phase or release needs a request covering it.

## Checked-in integrations and maintenance

The checked-in adapters invoke `.specify/scripts/bash/*.sh`; these scripts require
a compatible Bash shell. On Windows, configure the client to use a compatible shell
for these workflows. This checkout does not provide PowerShell-native `.ps1` scripts.

The repository checks in 50 command adapters across `.agents/skills/`,
`.claude/skills/`, `.kimi-code/skills/`, `.minimax/skills/` and `.opencode/commands/`.
The existing Spec Kit 1.2.5 CLI registry in `.specify/integration.json` records only
Codex (`codex`) and MiniMax (`mcode`); Codex remains the default. The additional
Claude/Kimi/OpenCode command files are project-provided client-discovery assets,
not a claim that those CLI integrations were installed or registered here. Read
the client's actual adapter for supported invocation.
The [launchers](prompts.md) explain the checked-in forms without imposing a model,
provider or machine-local skill dependency.

Project-owned `.specify/templates/overrides/` files resolve before bundled templates
through `.specify/scripts/bash/resolve-template.sh`. Core templates/scripts and
integration manifests remain the installed upstream baseline. Adapters contain a
local preflight and necessary policy corrections; manifest hashes record upstream
installation provenance, not a claim that locally customized adapters are pristine.
These project adaptations were copied from next-express-boilerplate commit
`a91bb38`, then locally adapted for the existing Oriental roadmap and registry.
The existing installation records/settings and upstream file hashes are preserved;
no source installation timestamp or five-client registration was copied.
After an intentional Spec Kit upgrade, review adapter changes and resolved overrides
against this contract before using them; preserve client-specific frontmatter and
invocation syntax. An incidental feature does not authorize reinstalling integrations.

The bundled `.specify/workflows/speckit/workflow.yml` is a generic four-command runner.
It does not encode this full phase sequence, engineering intake or command boundaries.
Use the selected client commands and this guide for project delivery; do not present
the generic runner as enforcement of these rules.
