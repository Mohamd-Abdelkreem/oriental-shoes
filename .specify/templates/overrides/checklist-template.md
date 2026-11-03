# [CHECKLIST TYPE] Checklist: [FEATURE NAME]

**Purpose**: [Written requirements-quality dimensions reviewed]
**Created**: [DATE]
**Roadmap Phase**: [PHASE_ID and exact title]
**Feature**: [Link to this feature's spec.md and relevant technical plan]

**Review Ownership**: A reviewer marks `[x]` only after inspecting the written
requirements/design and finding the criterion satisfied. A request to implement
includes this evidence-based review before code work under
`docs/workflow/phase-delivery.md`. During code implementation markers are read-only.
**Marker Semantics**: Requirements approval is not code completion or a test pass.
New custom checklist items remain unchecked until reviewed. The built-in
`checklists/requirements.md` keeps its SPECIFY/CLARIFY lifecycle.

Replace examples with actual requirements-quality questions, preserving unique
CHK IDs on amendments. Cite requirement/design evidence. Use only applicable
capabilities; do not add new product scope or future execution checks to this gate.
Apply `docs/workflow/implementation-handoff.md` at the current stage: assess existing
requirements/operation design; future TASKS briefs and executed tests remain pending
outputs, not circular prerequisites for this earlier checklist.

## Scope and Dependencies

- [ ] CHK001 Are the selected root roadmap phase, feature, deliverables, exclusions and prerequisite acceptance requirements unambiguous?
- [ ] CHK002 Do the requirements identify existing foundations and approved presentation to preserve rather than reinitialize or redesign?

## Behavior, Contracts and Authority

- [ ] CHK003 Are actors, success/failure outcomes, inputs/outputs, bounds and applicable ownership/status/role rules clear and testable?
- [ ] CHK004 Are duplicate, retry, stale/concurrent, history and side-effect semantics specified where relevant?
- [ ] CHK005 Are truthful asynchronous states, drafts/cache/access and affected accessibility requirements defined for frontend behavior?

## Delivery and Evidence Requirements

- [ ] CHK006 Does the technical design define the required backend acceptance before dependent frontend integration, or explain why that capability is N/A?
- [ ] CHK007 Do written verification requirements name meaningful automated test work and evidence boundaries proportionate to risks, without treating future runs as already passed?
- [ ] CHK008 Are phase exit criteria, unresolved decisions and required evidence clear enough to judge implementation later?

## Implementation Handoff Design

- [ ] CHK009 Do observable requirements include concrete accepted/denied/boundary/failure examples and unchanged-state outcomes where relevant?
- [ ] CHK010 Do available operation blueprints fix applicable file/symbol/signature, ordered algorithm, authority/data/error and UI/cache choices from accepted requirements and current source?
- [ ] CHK011 Are remaining material decisions explicitly identified rather than assigned to the limited implementation model, with technical planning and genuine product questions routed to their proper owners?
- [ ] CHK012 Does the planned TASKS handoff require bounded briefs/context and concrete verification cases without pretending those later briefs or checks already exist/pass?

## Review Notes

- [Reviewer evidence/findings by CHK ID; unresolved questions stay visible.]
- [Execution tests, command results and implementation acceptance belong in tasks/evidence, not preapproved checklist markers.]
