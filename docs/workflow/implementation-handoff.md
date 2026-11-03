# Implementation-ready handoff

This guide owns artifact detail, bounded execution briefs and the readiness gate
required by [constitution XI](../../.specify/memory/constitution.md). Assume every
phase will be implemented by a model with limited reasoning and context. Planning
must resolve material behavior and architecture before handing over implementation.
[Phase delivery](phase-delivery.md) still owns authorization, feature selection and
command write boundaries; [the engineering index](../engineering/README.md) routes
the actual implementation standards. This guide creates no product scope.

## Artifact responsibilities

| Artifact                                      | Must establish                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spec.md`                                     | Complete observable product truth: actors, inputs, bounds, authority, outcomes, state/failure behavior and concrete acceptance examples.          |
| Feature `plan.md` and linked design owners    | Source-grounded technical decisions: exact owners/interfaces, ordered algorithms, applicable data/HTTP/UI/cache behavior and verification design. |
| `tasks.md`                                    | Dependency-safe work plus an execution brief for every implementation task, linking the filled design and current source needed for that task.    |
| Existing feature evidence or command response | Readiness coverage and actual later execution results, clearly separated.                                                                         |

Keep each fact in one owner. Wire schemas/field decisions belong in the appropriate
shared contract/design owner; plans and briefs reference them instead of copying
competing schemas. A brief can reference a filled plan subsection precisely; a link
to an entire generic guide does not replace the operation's actual decisions.

## 1. Specify observable behavior

For every accepted operation, SPECIFY records the actor and preconditions, allowed
input and bounds, observable success, relevant denial/validation/conflict/failure
outcomes, and what must remain unchanged after failure. Add concrete examples with
representative input, starting state and expected result. Distinguish omitted/null/
empty values, duplicates, stale actions and uncertain external outcomes when relevant.
For UI behavior, include visible states, draft preservation and allowed surfaces.

Examples must exercise actual accepted requirements; they do not invent capacity,
commercial targets, roles or optional capabilities. Use safe synthetic values.
Preserve all unresolved material product decisions and their effects on readiness.
Ask genuine product questions or necessary nonsecret environment constraints that
cannot be established from the available source/context, each with the simplest
practical recommendation and consequence. Do not request credentials in a brief. Technical design choices are resolved in PLAN from current source,
accepted requirements and the canonical engineering recipes.

**Complete when:** each material requirement has an unambiguous observable acceptance
method, including applicable failures. Product acceptance does not require writing
implementation code or copying technical architecture into the spec.

## 2. Produce the operation blueprint in PLAN

Give each material operation a stable name or existing identifier. Record the
following in a filled plan subsection or a precisely linked existing design owner:

| Decision                  | Required detail when applicable                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope and ownership       | Requirement references; exact existing/proposed files; create/modify/reuse actions; preserved behavior.                                                                                                                                           |
| Interface ledger          | Exact reused/proposed exported symbols, signatures, inputs/results and collaborator/import owners; identify which exist now and which earlier tasks will create.                                                                                  |
| HTTP and contracts        | Method/path, middleware order/authority, referenced request/response schemas, status and stable error codes, safe projection and compatibility.                                                                                                   |
| Algorithm and authority   | Numbered steps and branches; server-derived actor; mutable eligibility and write predicates; missing/denied/stale/duplicate outcomes.                                                                                                             |
| Data and external effects | Selected fields, bounds/order, constraint names/purpose, transaction-client scope, conditional writes/affected-row outcomes, migration/existing-data handling, external-I/O ordering and uncertain-result/retry policy.                           |
| Frontend state            | Existing route/component/form owners; action-to-API mapping; exact query-key structure/options; cache update/invalidation scope; draft/reset/conflict policy; pending/duplicate/cancellation/late-response rules and visible error/state mapping. |
| Verification              | Concrete starting state/input, action and expected return/HTTP/UI/database outcome; test owner, real versus doubled boundary, infrastructure, cleanup and actual scoped commands.                                                                 |

Use enough pseudocode or a decision table to fix a nontrivial algorithm's order and
failure semantics. Full service/controller/component bodies are not planning output.
Resolve actual library signatures and reuse seams from current source/configuration;
label new paths/symbols as proposed. Explain any departure from the canonical recipe.
Use capability-specific N/A reasons for genuinely absent boundaries, not to hide an
undecided architecture. Ordinary syntax/local variable choices need no prescribed code.

**Complete when:** an implementer can locate the owners and follow the intended
algorithm without choosing a new contract, transaction strategy, error protocol or
cache policy. A planning PASS asserts design readiness, not executed behavior.

## 3. Write bounded task briefs in tasks.md

Keep checklist summaries and stable task IDs. Put briefs under `## Task Briefs` in
the same `tasks.md`; shared operation detail remains in the plan/design owner.
Every implementation task carries a brief or precisely references one covering it.
Group tasks only when their ownership and dependencies permit the same bounded brief;
each ID must have its own clear permitted changes and completion condition.

A brief contains:

1. **Outcome:** exact IDs/requirements, dependency IDs, prerequisite evidence and
   the observable result of this task. Distinguish design readiness from backend
   acceptance that must later precede dependent frontend execution.
2. **Allowed file actions:** exact create/modify/test paths and symbols. Name existing
   foundations to reuse and exclusions. A listed directory alone is insufficient.
3. **Read-before-edit context:** filled plan/contract/data sections, applicable guide
   headings, current source paths/symbols, immediate callers and relevant test/harness
   owners. State whether an interface exists or is an earlier task's proposed output.
   Name current limitations/deviations at the touched boundary and the planned scoped
   correction or explicit exclusion; distinguish observed legacy behavior from the
   required target so a nearby shortcut does not become the implementation recipe.
4. **Ordered steps:** concrete changes/branches or precise references to the filled
   operation algorithm, preserving selected signatures, authorization, transactions,
   output/error and UI/cache decisions. Avoid instructions such as "handle errors"
   or "follow best practice" without the actual operation-specific decisions.
5. **Invariants and failure behavior:** preserved fields/design/protocol, forbidden
   side effects, expected unchanged state and relevant duplicate/stale/late outcomes.
6. **Verification and done:** named test path/cases, representative inputs and expected
   outcomes, commands/infrastructure, cleanup, review and evidence required to mark
   this ID complete. Reference shared cases rather than duplicate their definitions.

The context bundle is this read-before-edit list plus the brief's filled design
references, not a new report or copied repository. Prefer source path plus symbol and
heading over fragile line numbers. If a source excerpt is necessary, identify its
revision/state and verify it before use. Reopen current source on handoff/resume;
account for expected changes produced by completed dependency tasks.

Size tasks around coherent responsibilities and dependency gates. An instruction to
"build backend and frontend" across many owners is not a bounded task. File-count or
line-count quotas do not determine size; meaningful existing test/harness changes can
belong with their operation. Documentation/check-only tasks use the same brief fields
at the detail needed by their actual scope, with unused capabilities explicitly N/A.

**Complete when:** every task ID maps to actionable decisions, a bounded context
bundle, allowed work, concrete checks and an observable done condition. No extra
brief file is needed per task.

## 4. Apply the readiness gate at the correct stage

| Stage             | Obligation                                                                                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SPECIFY / CLARIFY | Establish product behavior/examples and resolve actual product questions. Report remaining gates; do not invent technical architecture in the spec.                                                                              |
| PLAN              | Before research, check viable scope/source/research coverage; after design, require filled applicable blueprints and planned brief production. TASKS creates the later briefs; their absence cannot block their producing step.  |
| CHECKLIST         | Review the written requirements/design available at this stage, including blueprint specificity. New custom markers remain unchecked. Do not require future task briefs or execution results before their producing step.        |
| TASKS             | Produce all required briefs, concrete context references and dependencies; report unresolved handoff decisions rather than delegating them to implementation.                                                                    |
| ANALYZE           | Read-only review every in-scope task's brief against the filled spec/design and current source. Report per-ID readiness and missing decisions; preserve files/markers and selection.                                             |
| IMPLEMENT         | Before implementation code edits, check selected briefs/current source and dependency readiness; then execute the recorded decisions and verify outcomes. Recheck the next dependent batch against expected predecessor changes. |
| CONVERGE          | Check implemented behavior and evidence against the same blueprint/briefs. Appended remediation implementation tasks need equally actionable briefs in the appended section; preserve all earlier content.                       |

For ANALYZE, the default coverage is the selected feature's whole task list. An
explicit narrower review scope must name excluded task IDs as NOT REVIEWED; it is
not whole-phase readiness. During read-only ANALYZE, put this compact table in the
response only. A separate authorized writing stage may persist its own readiness
assessment in the existing feature evidence owner:

| Task ID   | Brief / design / source references | Readiness                     | Missing decision or concrete evidence               |
| --------- | ---------------------------------- | ----------------------------- | --------------------------------------------------- |
| Actual ID | Exact sections/symbols             | PASS / BLOCKED / NOT REVIEWED | Supported observation or smallest owning correction |

A task is ready only when all its applicable brief fields are filled, contracts and
source assumptions agree, technical choices are resolved, dependencies are explicit
and verification cases are concrete. Instructions/placeholders such as `[choose]`,
"use an appropriate approach", or generic best-practice prose cannot stand in for
material decisions. Deliberately documented runtime values, template teaching text
and justified absent-capability N/A are different from unresolved generated content.

IMPLEMENT checks the selected briefs before implementation code edits, while recognizing that proposed
outputs of unfinished prerequisite tasks do not yet exist. Their interfaces must be
designed; their absence blocks consumers until the dependencies actually complete.
Missing technical decisions, stale source signatures or contradictory behavior block
the dependent work. Identify the exact owning plan/task/contract correction. Repair
through the authorized planning step when covered by the current sequence; a
standalone IMPLEMENT request does not authorize inventing a new architecture or
silently rewriting accepted product/design artifacts. Continue independent authorized
tasks. Ask the user when an actual product/authority choice or necessary nonsecret
runtime/environment constraint cannot be established from available evidence. Keep
secret values outside artifacts and ordinary chat diagnostics.

Routine implementation remains possible within the fixed contracts: local names,
clear control-flow syntax and faithful use of existing helpers need no new approval.
If a newly discovered constraint changes a material interface/algorithm, record the
gap and return it to its owner. Readiness is a checkable handoff property; it does not
guarantee model performance, test success, backend acceptance, release or absence of
defects. Those claims require their own evidence under the existing engineering rules.
