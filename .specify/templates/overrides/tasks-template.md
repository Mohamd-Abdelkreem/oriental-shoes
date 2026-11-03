---
description: "Project-owned dependency-ordered phase task template"
---

# Tasks: [FEATURE NAME]

**Roadmap Phase**: [PHASE_ID and exact title from root plan.md]
**Feature Directory**: [specs/actual-feature]
**Input**: [This feature's accepted spec.md, technical plan.md and applicable design artifacts]
**Authorized Scope**: [User-selected phase/IDs/sequence; exclusions]

Apply `.specify/memory/constitution.md`, `docs/workflow/phase-delivery.md` and
`docs/engineering/README.md` from the repository root. These are internal delivery
groups within one selected feature, not new roadmap phases. Preserve existing task
IDs, progress and accepted decisions when amending a task list. Apply
`docs/workflow/implementation-handoff.md` for brief detail and readiness.

## Task Format and Generation Rules

Use `- [ ] T### [P?] [US#?] Description with exact file path and verifiable outcome`.
Assign unique stable IDs; story work includes its actual story label. `[P]` means
different files, no unmet dependency and no conflicting shared writer. It describes
dependency independence, not permission for external actions.

Replace every sample below with tasks grounded in the actual spec/design/source.
Create only needed groups and files. Reuse the checked-in workspace, authentication,
transport, contracts, database and test infrastructure. Setup means a concrete missing
prerequisite, not reinitialization of the boilerplate or Spec Kit.

Every behavior-changing phase creates or extends actual discovered automated test
files. Cover relevant success, failure, validation, authority, boundary, regression,
concurrency/rollback and cross-layer risks. Choose evidence at its actual boundary.
Docs-only changes use docs checks. Tests are required by behavior/risk, not a request
for a particular number of files or a universal coverage percentage. Regression fixes
first reproduce the behavioral failure; use test-first development when requested
or appropriate to the task, not ceremonial failing tests for documentation.

## Group 1: Scoped Intake and Actual Prerequisites

**Goal:** establish the exact phase/feature mapping, preserved work and accepted design.

- [ ] T001 Confirm [PHASE_ID/spec/pointer mapping] and record applicable owners, requirements-quality review and dependency evidence in [existing feature evidence owner].
- [ ] T002 [Only if actually missing] Implement [specific prerequisite] in [exact path], reusing [existing foundation].

## Group 2: Required Backend, Tests and Acceptance

Organize actual story tasks within this group using `[US#]`. Shared prerequisites
precede consumers. Keep independent stories traceable even when one backend gate
precedes all dependent UI. Omit the group with an explicit N/A reason when the feature
has no new backend dependency.

- [ ] T003 [US1] Define/update [shared schema and API/OpenAPI agreement] in [exact paths], preserving [authority/output contract].
- [ ] T004 [US1] Implement [safe schema/migration/constraint or query owner] in [exact paths], with [data/race/failure outcome].
- [ ] T005 [US1] Implement [service/controller/route/composition behavior] in [exact paths], enforcing [actor and transition].
- [ ] T006 [P] [US1] Create/extend [discovered test file] for [positive/negative/boundary/security behavior] using [actual runner/boundary].
- [ ] T007 [US1] Verify [real PostgreSQL/Express/provider-failure boundary] through [exact test paths], asserting [final state/rollback/denial].
- [ ] T008 Review the required backend files/callers against [applicable engineering guides]; record separate requirements/engineering verdicts and actual backend checks in [existing evidence owner].

**Gate:** all backend behavior needed by the frontend below must be implemented,
reviewed and tested. Fixtures, mocked persistence and partial endpoints do not pass.

## Group 3: Dependent Existing-Frontend Integration

Start only after Group 2's applicable acceptance gate. Reuse existing design,
components and tokens. A missing required product surface stays an explicit decision.
Omit this group when there is no frontend work.

- [ ] T009 [US1] Connect [feature API/hooks/model owners] in [exact paths] through the central client and validated shared response contract.
- [ ] T010 [US1] Integrate [existing component/page] in [exact paths], preserving design and implementing [async/draft/access/cache/late-response behavior].
- [ ] T011 [US1] Create/extend [discovered component/hook test path] for [real interaction and relevant failures/races].
- [ ] T012 Review affected frontend files/callers against [applicable guides] and verify [required browser/accessibility/responsive/language cases] in [existing evidence owner].

## Group 4: Cross-Layer and Phase Exit

- [ ] T013 Verify [completed producer/consumer journey] in [actual test/browser owner], asserting [authoritative state and safe failure].
- [ ] T014 Update [specific affected docs] and run their reference/example/format checks.
- [ ] T015 Run [actual full applicable exit commands], review both requirements and engineering compliance, and record results/warnings/unverified boundaries in [existing evidence owner].

**Exit:** [Observable accepted phase criteria and required evidence.] A completed
batch/backend group is not a whole-phase or release claim. Commit, push, deployment
and consequential external actions require authorization covering that action.

## Dependencies and Safe Execution

- [Actual prerequisite task IDs and story dependencies.]
- [Exact backend acceptance IDs that block dependent frontend tasks.]
- [Parallelizable task IDs, their independent files and satisfied dependencies.]
- [Focused checks per batch and full applicable phase-exit checks.]
- [Selected first batch or whole-phase execution scope; preserve completed tasks.]

## Task Briefs

Follow implementation-handoff section 3. Create a filled brief for every implementation
task or precisely reference a shared bounded brief; keep it in this tasks.md. Link
filled operation decisions rather than repeat schemas. Each ID needs its own allowed
changes and observable done condition. Replace every instruction/example placeholder
with this feature's actual decisions before claiming handoff readiness.

### [T###] — [Observable outcome]

- **Requirements / dependencies**: [FR/story/example; prerequisite task IDs and required evidence]
- **Allowed file actions**: [Exact create/modify/test paths and symbols; preserved existing foundations and excluded changes]
- **Read-before-edit bundle**: [Exact filled plan/contract/data sections, applicable guide headings, source paths/symbols/callers and test/harness owners; existing versus dependency-proposed interface; touched-boundary limitations and planned correction/exclusion, clearly separated from target behavior]
- **Ordered steps**:
  1. [Concrete action and accepted signature, or precise filled operation algorithm reference.]
  2. [Applicable authority/write predicate/transaction/error/output or UI/query/cache/draft/late-response decision.]
  3. [Final outcome and required reconciliation/cleanup.]
- **Preserve / failure unchanged**: [Data/design/protocol invariant; forbidden side effect and defined failure/duplicate/stale behavior]
- **Tests / verification**: [Discovered file, actual input/start state/action → expected response/UI/persisted or unchanged outcome; boundary/infrastructure/doubles/cleanup; exact command]
- **Done when**: [Observable task outcome plus actual check/review evidence required to mark this ID complete]

Routine syntax/local naming within these fixed contracts needs no new design approval.
If a material interface/algorithm choice is unresolved, name the planning owner and
block dependent execution instead of delegating the choice to the implementation model.

## Implementation Readiness Coverage

| Task ID                  | Filled brief / blueprint / source references | Readiness                   | Gap / evidence                                            |
| ------------------------ | -------------------------------------------- | --------------------------- | --------------------------------------------------------- |
| [Every in-scope task ID] | [Exact owner sections and symbols]           | [PASS/BLOCKED/NOT REVIEWED] | [Concrete design/source evidence or necessary correction] |

TASKS reports unresolved design decisions. ANALYZE checks this coverage read-only;
IMPLEMENT rechecks selected briefs and current source before editing. This is handoff
readiness, not executed-test/backend/phase acceptance. Legitimate absent capabilities
use reasoned N/A inside the brief; no task is waved through by generic best-practice prose.

## Requirement and Review Coverage

| Requirement / risk                     | Implementation IDs | Test / review / evidence IDs |
| -------------------------------------- | ------------------ | ---------------------------- |
| [FR/SC/story and applicable principle] | [IDs]              | [IDs]                        |

Convergence appends equally actionable briefs for new remediation implementation
tasks in its new section, preserving all earlier IDs/content. Its read-only
inspection leaves existing content and markers intact; no gaps means no append.
