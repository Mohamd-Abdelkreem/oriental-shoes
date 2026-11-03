# Feature Specification: [FEATURE NAME]

**Roadmap Phase**: [PHASE_ID and exact title from root plan.md]
**Feature Directory**: [specs/actual-feature]
**Feature Branch**: [actual branch, independent of phase/directory numbering]
**Created**: [DATE]
**Status**: Draft
**Input**: [User request and existing accepted decisions]

Use `.specify/memory/constitution.md` and `docs/workflow/phase-delivery.md`
from the repository root. This template defines
product intent, not implementation or executed evidence. Apply
`docs/workflow/implementation-handoff.md` for complete observable product behavior.
Replace all instructional
placeholders with accepted feature content; include only relevant capabilities.

## Scope and Baseline

- **Outcome**: [Observable value delivered by this phase]
- **Existing behavior**: [Verified persisted behavior versus fixture/local/missing behavior]
- **Deliverables**: [Bounded in-scope behavior]
- **Exclusions**: [Deferred capabilities and unrelated changes]
- **Dependencies**: [Accepted prerequisite phases and required evidence]
- **Existing foundations**: [Auth, contracts, transport and infrastructure to reuse]
- **Frontend boundary**: [Existing surfaces/design to preserve; necessary functional changes]
- **Open decisions**: [Genuine product decisions, consequence and simplest recommendation]

## User Scenarios & Testing _(mandatory)_

Prioritize actual journeys. Each story needs a meaningful independently verifiable
outcome; record real dependencies rather than pretending every story can ship alone.

### User Story 1 — [Title] (Priority: P1)

[Actor, goal and value]

**Why this priority**: [Reason]
**Independent Test**: [Observable behavior and preconditions]

**Acceptance Scenarios**:

1. **Given** [state and actor], **When** [action], **Then** [authoritative outcome].
2. **Given** [invalid/denied/failing condition], **When** [action], **Then** [safe outcome and preserved state].

### Concrete Acceptance Examples

| Requirement / scenario | Actor and starting state | Concrete safe input / action            | Expected observable result            | State unchanged on failure    |
| ---------------------- | ------------------------ | --------------------------------------- | ------------------------------------- | ----------------------------- |
| [Actual FR/scenario]   | [Representative state]   | [Actual accepted/denied/boundary value] | [Success or exact observable failure] | [Preserved data/draft/effect] |

Use representative synthetic values for this feature's real bounds and failure
branches; cover omission/null/empty, duplicates/stale actions or uncertain outcomes
where applicable. Reference a shared example instead of duplicating its meaning.
Repeat stories/examples only for actual accepted behavior. Product questions remain
explicit with the simplest practical recommendation; technical design belongs in PLAN.

### Edge Cases

- [Relevant invalid inputs, bounds and unavailable resources]
- [Applicable duplicate, stale/concurrent, cancellation and uncertain-outcome behavior]
- [Access changes, wrong owner/account and failure/retry effects]

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: [Actor, allowed operation, inputs and observable result]
- **FR-002**: [Failure/denial outcome and required unchanged state]

[Add unique requirements for accepted behavior. Preserve existing IDs on amendments.]

### Authority and Data Rules

- [Actors and server-enforced ownership/status/role/transition rules]
- [Persisted invariants, deletion/history, duplicates and concurrency where applicable]
- [Bounded lists/search/uploads and safe public/private projection]
- [External-provider acknowledgement versus confirmed business outcome, if applicable]

### Frontend and State Requirements

- [Approved design and existing controls/components to reuse]
- [Applicable loading, empty, error/retry, pending, success, conflict, denied and stale states]
- [Draft/cache/account/late-response behavior; affected accessibility and language/direction]
- [Exact missing-surface decision if accepted behavior cannot use an existing surface]

### Key Entities _(when data is involved)_

- **[Entity]**: [Meaning, attributes and relationships without ORM implementation]

## Verification Requirements

Every behavior-changing implementation phase must create or extend discovered
automated test files. Identify applicable success, validation, negative, boundary,
authorization, privacy, regression, race/rollback and failure cases. The technical
plan chooses real test owners and commands; test-file quantity is not the goal.

- **VR-001**: [Requirement/risk and observable automated evidence]
- **VR-002**: [Actual PostgreSQL/Express/component/browser boundary needed by the claim]
- **VR-003**: [Relevant cross-layer journey and preserved-UI checks]
- **Documentation-only scope**: [If applicable, reference/example/format checks instead]

Required backend behavior/review/testing must pass before dependent frontend
integration. Technical completion, phase acceptance and release are separate claims.

## Success Criteria _(mandatory)_

- **SC-001**: [Measurable user-visible outcome with acceptance method]
- **SC-002**: [Measurable failure/security/integrity or regression outcome]

Accepted generated content must contain filled requirements/examples and explicit
remaining decisions, not instructional placeholders or generic "handle errors" prose.
No unresolved material product choice may be delegated to implementation.

Use agreed constraints and observable outcomes; do not invent scale, performance,
satisfaction or commercial targets from template examples.

## Assumptions and Decisions

- [Supported assumption and its consequence]
- [Accepted decision reference; distinguish proposals and unresolved questions]

## Phase Exit

[Required deliverables and evidence; remaining owner/environment/release boundaries.]
