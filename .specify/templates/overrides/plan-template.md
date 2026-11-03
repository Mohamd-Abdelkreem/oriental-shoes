# Implementation Plan: [FEATURE NAME]

**Roadmap Phase**: [PHASE_ID and exact root plan.md title]
**Feature Directory**: [specs/actual-feature]
**Date**: [DATE]
**Spec**: [Link to this feature's spec.md]
**Authorized Scope**: [Requested design/sequence and exclusions]

This is the feature's technical plan. Root `plan.md` owns the project roadmap.
Apply `.specify/memory/constitution.md`, `docs/workflow/phase-delivery.md` and
`docs/engineering/README.md` from the repository root. Reuse accepted artifacts;
update affected sections rather than regenerating completed foundations. Apply
`docs/workflow/implementation-handoff.md` as the operation-blueprint/readiness owner.

## Summary

[Accepted behavior, current gap, technical approach and dependency ordering.]

## Technical Context

Inspect actual manifests/config/source; record verified values and source paths.
Use `NEEDS CLARIFICATION` only for a material unresolved fact or product decision.

**Language/Runtime**: [Verified toolchain]
**Primary Dependencies**: [Existing relevant packages; justification for additions]
**Storage**: [Actual persistence/provider boundaries or capability-specific N/A]
**Testing**: [Owning runners, discovered file patterns and required infrastructure]
**Target Platform**: [Actual deployment/browser scope]
**Existing Foundations**: [Reusable auth/session, transport, contracts, composition and database]
**Constraints**: [Accepted requirements and operational bounds]
**Performance/Scale**: [Specified or measured concern; N/A with reason if none]
**Preserved Work**: [Existing edits and accepted behavior]

## Constitution Check

**Gate:** record before research and recheck after design. Each row needs PASS,
capability-specific N/A, or BLOCKED with exact evidence/action. A justification
table cannot waive a mandatory principle. Before research, PASS establishes authorized
scope, a viable design/research approach and coverage of unresolved technical facts.
After design, PASS requires filled applicable operation blueprints and adequate
planned verification. Briefs are produced later by TASKS. Neither checkpoint asserts
implemented behavior, executed tests, backend acceptance or release readiness.

| Check                                                                                     | Applicable owners and planned evidence           | Before research                                | After design                                     |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------ |
| Scope, phase/feature selection, dependencies and preserved baseline                       | [Evidence]                                       | [Status]                                       | [Status]                                         |
| Architecture, responsibility/dependency direction and reused foundations                  | [Evidence]                                       | [Status]                                       | [Status]                                         |
| Shared contracts, exact HTTP behavior, authority and safe boundaries                      | [Evidence]                                       | [Status]                                       | [Status]                                         |
| Data invariants, bounded work, races, migrations/recovery and external effects            | [Evidence]                                       | [Status]                                       | [Status]                                         |
| Backend acceptance before dependent frontend, approved design and UI state                | [Evidence]                                       | [Status]                                       | [Status]                                         |
| Meaningful tests, infrastructure, focused/exit checks and two review verdicts             | [Evidence]                                       | [Status]                                       | [Status]                                         |
| Operation design readiness, current source/interface agreement and planned bounded briefs | [Research/design evidence; briefs pending TASKS] | [Scope, source baseline and research coverage] | [Filled blueprints and planned brief production] |

## Project Structure and Responsibility Owners

### Documentation (this feature)

```text
specs/<actual-feature>/
├── spec.md
├── plan.md              # This technical plan
├── research.md          # Only for concrete decisions needing research
├── data-model.md        # When persistence is affected
├── contracts/           # When a wire/interface boundary is affected
├── quickstart.md        # Useful setup/verification instructions
├── checklists/          # Requirements-quality review
└── tasks.md             # TASKS command output, not PLAN output
```

### Source owners

Use actual current paths in `apps/api`, `apps/web`, `packages/contracts` and
`packages/database`; create only files with an independent needed responsibility.

| Responsibility                          | Existing/proposed exact owner | Reason and dependency direction    |
| --------------------------------------- | ----------------------------- | ---------------------------------- |
| Shared schema, DTO reuse and OpenAPI    | [Paths]                       | [Contract]                         |
| Route/middleware/controller/composition | [Paths]                       | [HTTP adaptation and dependencies] |
| Service/rules/errors/queries/mappers    | [Needed paths]                | [Use case and data projection]     |
| Schema/migration/provider adapter       | [Applicable paths]            | [Persistence/integration]          |
| Feature API/hooks/model/components/page | [Applicable paths]            | [Transport/state/rendering]        |
| Tests and fixtures/harness              | [Discovered paths]            | [Evidence boundary]                |

## Contracts, Authority and Failure Design

[Method/path/status/schema/error agreement; actor and current authorization;
safe public projection; bounded input; omission/null/empty semantics.]

[Transactions/constraints/conditional writes; duplicates/retries/stale edits;
external uncertainty; migration/existing-data/recovery when applicable.]

## Operation Blueprints

Follow `docs/workflow/implementation-handoff.md` section 2. Repeat this filled
subsection for each material operation, using its stable name/ID. Link each fact's
owning contract/data/design section rather than duplicate wire schemas. Resolve
technical choices from accepted behavior, current source and canonical recipes.

### [Operation name / ID]

**Requirements and examples**: [Exact spec sections/FR/scenarios]
**Allowed scope / preserved behavior**: [In-scope change and invariant]

| File / symbol            | Existing or proposed; action                            | Exact signature / collaborator / contract owner                                                   |
| ------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [Actual path and export] | [REUSE/MODIFY/CREATE; producing dependency if proposed] | [Source-verified existing signature or deliberately proposed signature and referenced wire owner] |

**Read context**: [Actual caller, source/test/harness symbols and applicable guide headings]
**Current deviations versus target**: [Observed touched-boundary limitation and planned
scoped correction or explicit exclusion; existing source is not automatic compliance]
**HTTP/authority/output/errors**: [Exact applicable method/path/middleware/actor/status/
error code and output projection decisions, or precise links to their filled owners]

**Ordered algorithm and failure branches**:

1. [Concrete input/authority check and defined branch outcome.]
2. [Exact applicable query/write predicate, selected fields, transaction client/boundary,
   constraint/CAS result, duplicate/stale handling or pure transformation.]
3. [Dependent writes/external-I/O ordering, success projection and failure unchanged state.]

Use short pseudocode/decision tables when needed to fix sequencing. State bounds,
order/index/migration/recovery and provider uncertainty only when relevant; justify N/A.
Full production implementation bodies are not planning output.

**Frontend decisions**: [Existing route/component/action/form owner; precise query-key
structure/options and API mapping; cache effects; draft/reset/conflict/pending/duplicate/
late-response/cancellation policy; visible status/error mapping, or justified N/A]

| Case / requirement                          | Concrete starting state + input/action | Expected response/UI and persisted/unchanged outcome   | Test owner / boundary / command                                     |
| ------------------------------------------- | -------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| [Actual success/failure/boundary/race case] | [Safe representative values]           | [Observable assertions, not internal call tautologies] | [Discovered path, infrastructure/double/cleanup and actual command] |

**Remaining design decisions**: [Resolved source-grounded decision references or exact
blocker. No material interface/algorithm/error/cache choice may be left to IMPLEMENT.]

## Backend and Frontend Delivery Groups

1. **Required backend:** [Contracts, schema/data, authority, use cases, endpoints,
   providers and failure behavior needed by this feature.]
2. **Backend acceptance gate:** [Real tests/review and evidence needed before dependent UI.]
3. **Dependent frontend:** [Existing surfaces, API/hooks/model owners and necessary
   functional changes; design preservation, drafts/cache/late replies and async states.]
4. **Cross-layer acceptance:** [Journey, browser/accessibility checks and exit evidence.]

Mark an absent capability N/A with a reason. Do not require unrelated backend work
for UI-only behavior or recreate accepted foundation tasks.

## Verification and Review Plan

| Requirement / risk                | Test file or check owner | Actual command / environment | Required outcome                 |
| --------------------------------- | ------------------------ | ---------------------------- | -------------------------------- |
| [FR/SC and failure/boundary risk] | [Discovered test path]   | [Manifest-backed command]    | [Observable assertion]           |
| [Persistence/authority/UI claim]  | [Actual boundary]        | [Required service/browser]   | [State/evidence]                 |
| [Phase exit]                      | [Applicable full checks] | [Commands and effects]       | [Pass/explicit missing evidence] |

List applicable engineering guide sections and optional review skills. Plan separate
requirements and engineering verdicts. Identify focused/affected checks per batch,
full applicable exit checks, unavailable infrastructure and unperformed device/release
boundaries. Docs-only plans use documentation checks.

## Decisions and Complexity Tracking

| Decision / concrete deviation      | Why needed | Simpler alternative and impact |
| ---------------------------------- | ---------- | ------------------------------ |
| [Only justified current decisions] | [Evidence] | [Reason]                       |

## Design Readiness and Exit

[Apply implementation-handoff section 4 to this stage: each applicable operation
blueprint is filled, interfaces match verified source/proposed dependencies, technical
choices and concrete cases are resolved, and TASKS has enough design to produce its
briefs. Record PASS/BLOCKED and exact evidence. Task briefs remain pending until TASKS;
future execution is not preapproved.]

Remove instructional placeholders and generic best-practice substitutes from the
generated accepted handoff. Preserve legitimate runtime parameters and reasoned N/A.
Routine local coding choices remain free within the fixed behavior/interfaces.

[Observable completion gate, unresolved decisions/evidence and next authorized action.
Distinguish backend group, batch, phase and release.]
