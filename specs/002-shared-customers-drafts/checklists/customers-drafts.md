# Customer and Draft Requirements Quality Checklist

**Purpose**: Review completeness, clarity, consistency, measurable acceptance and coverage of the written P02 requirements and available operation design  
**Created**: 2026-11-05  
**Roadmap Phase**: P02 — Shared customers and persistent incomplete sales drafts  
**Feature**: [Specification](../spec.md) and [technical plan](../plan.md)  
**Supporting owners**: [Contracts](../contracts/customers-drafts.md), [data design](../data-model.md), [frontend design](../frontend-design.md)  
**Audience / timing**: Requirements/design reviewer, after PLAN and before TASKS  
**Depth**: Standard, emphasizing shared-customer privacy, incomplete captures, concurrent changes, uncertain saves and preserved presentation

**Review Ownership**: A reviewer marks `[x]` only after inspecting the written requirements/design and recording why the criterion is satisfied. A request to implement includes evidence-based requirements review before code work under `docs/workflow/phase-delivery.md`; during code implementation these markers are read-only. This command generates questions only and leaves every new item unchecked.

**Marker Semantics**: `[x]` means approval of written-requirements quality, not implementation completion, an executed test or phase/release acceptance. The separate built-in [requirements.md](requirements.md) retains its SPECIFY/CLARIFY lifecycle and is unchanged.

References below use **Spec** for requirement IDs/scenarios, **Plan** for operation IDs/sections, **Contracts** and **Data** for numbered design sections, and **Frontend** for F01–F09. They identify material for the reviewer, not preapproved answers. Future task briefs and execution evidence are pending outputs, not prerequisites for this producing-stage review.

## Scope and Dependencies

- [x] CHK001 Are the selected P02 feature, intended outcome, deliverables and exclusions unambiguous and consistent with the protected roadmap? [Completeness, Consistency, Spec §Scope and Baseline; Plan §Summary]
- [x] CHK002 Are P01 prerequisites and reused foundations distinguished from historical acceptance evidence and from behavior that P02 still needs to define? [Clarity, Dependency, Spec §Scope and Baseline; Plan §Technical Context]
- [x] CHK003 Are the received catalog/pricing inputs, P03 submission boundary, NUM-01 and OPS-01 gates described without making them prerequisites for an incomplete draft? [Consistency, Dependency, Spec §Scope and Baseline; Spec §FR-011/024; Plan §Constitution Check]
- [x] CHK004 Are the existing presentation, routes and browser-local baseline explicitly distinguished from intended persistent authority, without implying a redesign or fixture import? [Clarity, Scope, Spec §FR-027; Plan §Project Structure and Responsibility Owners; Frontend §F01]

## Behavior, Contracts and Authority

- [x] CHK005 Are customer requiredness, optional email/address/notes and the different uniqueness roles of phone and email stated completely? [Completeness, Spec §FR-002–005; Contracts §2–3]
- [x] CHK006 Are accepted Saudi phone forms, digit scripts, equivalent formatting and rejected forms defined consistently for customer identity, search and phone-based routes? [Clarity, Consistency, Spec §FR-003/006; Spec §D-001; Contracts §2]
- [x] CHK007 Are omission, blank, null and full-replacement meanings explicit across customer edits and draft captures, including significant nonblank text and hidden type-specific fields? [Clarity, Edge Coverage, Spec §FR-005/011–014; Contracts §2–3; Frontend §F05]
- [x] CHK008 Are stable customer/draft/piece identities clearly separated from mutable phone numbers, row positions, technical references and future business numbers? [Consistency, Spec §FR-006/010/015–016; Data §1–2]
- [x] CHK009 Do the requirements distinguish missing records, duplicate names, search text, explicit customer selection and old-phone resolution without permitting an arbitrary fallback record? [Completeness, Edge Coverage, Spec §FR-004/006/008; Spec §Edge Cases; Frontend §F04]
- [x] CHK010 Is shared contact access consistently separated from ownership of related drafts, orders, measurements, counts, latest summaries and activity for sales and ADMIN? [Privacy Coverage, Spec §FR-007/017–019; Spec §Authority and Data Rules; Data §4; Frontend §F06]
- [x] CHK011 Are current eligibility changes and denied resource access defined with clear information-disclosure limits and unchanged-state outcomes? [Completeness, Privacy, Spec §FR-001/019; Spec §US5; Contracts §5; Plan §OP-02–06]
- [x] CHK012 Are inline customer confirmation, explicit selection, unsent cancellation and pending/uncertain dismissal distinguished from persistence of the surrounding paper? [Clarity, Scenario Coverage, Spec §FR-008–009; Spec §US2; Frontend §F03–F04]
- [x] CHK013 Is the minimum valid draft defined independently of final submission, including known type, one blank row and absence of customer, specifications or date? [Completeness, Spec §FR-010–011; Spec §US3; Contracts §3]
- [x] CHK014 Are all captured paper fields identified independently, particularly middle floor addition versus final additions, M1/M2/M3/face text, measurements and repair/adjustment notes? [Completeness, Consistency, Spec §FR-012; Contracts §3; Frontend §F05]
- [x] CHK015 Are real calendar dates, action timestamps, actual actor identity, signature text and provisional paid capture clearly distinguished from approval and authoritative finance? [Clarity, Spec §FR-013–014/022–024; Contracts §2–3; Data §1]
- [x] CHK016 Are piece addition, copying, removal, resequencing and the final-row restriction specified without ambiguity about identity, retained history or post-submission cancellation? [Completeness, Edge Coverage, Spec §FR-015–016; Spec §US4; Data §1–3; Frontend §F05]
- [x] CHK017 Are manual-save boundaries and all-or-nothing changes defined consistently for draft fields, pieces, revision and retained actor/time evidence? [Consistency, Spec §FR-011/015/021–022; Plan §OP-03/05–06; Data §3]
- [x] CHK018 Are duplicate-phone races and stale customer/draft edits described with distinct outcomes, preserved winning data and retained losing input? [Clarity, Exception Coverage, Spec §FR-004/020; Spec §US1/US6; Contracts §5]
- [x] CHK019 Are same-intent repetition, changed intent, uncertain outcome and retained receipt semantics defined without conflating the original saved result with current resource data? [Clarity, Recovery Coverage, Spec §FR-021/025–026; Spec §SC-006; Contracts §5; Plan §OP-06]
- [x] CHK020 Are rejected writes, possibly committed unknown outcomes and confirmed saves with incomplete synchronization described as different recovery states? [Consistency, Recovery Coverage, Spec §FR-020–026; Spec §SC-006; Frontend §F03/F07]
- [x] CHK021 Are dirty-editor preservation, pending input restrictions, explicit conflict review and late account/resource/form results specified consistently across the relevant surfaces? [Clarity, Edge Coverage, Spec §FR-020/025–027; Frontend §F02–F05]
- [x] CHK022 Are search, filters, pagination, related counts and aggregate-summary scopes consistent between the written producer and consumer designs? [Consistency, Spec §FR-006/017–018; Contracts §2–4; Data §4; Frontend §F02/F06]
- [x] CHK023 Are provisional measurements, unavailable later-phase data, unpriced finance and unavailable submission clearly distinguished from approved history, real empty results and zero values? [Clarity, Consistency, Spec §FR-007/018/023–025; Frontend §F05–F07]

## Delivery and Evidence Requirements

- [x] CHK024 Can the success criteria be assessed objectively from the written outcomes, with clear traceability to the functional requirements and no invented scale or commercial targets? [Measurability, Spec §SC-001–008; Spec §FR-001–027]
- [x] CHK025 Do the acceptance examples identify starting conditions, representative inputs, success/denial/failure outcomes and appropriate unchanged-state guarantees? [Acceptance Quality, Spec §Concrete Acceptance Examples; Spec §Edge Cases; Spec §SC-006]
- [x] CHK026 Are the required evidence boundaries and their limitations documented without treating planned checks, source inspection or prior results as newly proven behavior? [Clarity, Evidence Quality, Spec §VR-001–005; Plan §Verification and Review Plan]
- [x] CHK027 Is required backend acceptance explicitly ordered before dependent frontend integration, with design, backend, whole-phase and release readiness kept distinct? [Consistency, Dependency, Spec §VR-005; Spec §Phase Exit; Plan §Backend and Frontend Delivery Groups]
- [x] CHK028 Are currently inapplicable capabilities and evidence limits explicit, including persisted non-DRAFT scenarios before P03, absent infrastructure and later release dependencies? [Coverage, Assumption, Plan §OP-05; Plan §Design Readiness and Exit; Frontend §F09]
- [x] CHK029 Are data preservation, retained history, migration recovery and owned-data boundaries sufficiently defined without implying destructive recovery or permission for real-environment changes? [Completeness, Recovery Coverage, Spec §FR-022; Spec §Verification Requirements; Plan §OP-09; Data §2/5]

## Implementation Handoff Design

- [x] CHK030 Do the available operation blueprints trace each material operation to accepted requirements, concrete examples and a clear observable completion boundary? [Traceability, Plan §OP-01–09; Spec §Functional Requirements; Spec §Success Criteria]
- [x] CHK031 Are responsibility owners and interface dependencies explicit, with existing foundations distinguished from proposed outputs and no contradictory definitions across design owners? [Design Completeness, Consistency, Plan §Project Structure and Responsibility Owners; Contracts §6; Frontend §F01]
- [x] CHK032 Do the written blueprints resolve applicable input/output, authority, change-order, failure, history and frontend-state decisions precisely enough to avoid material invention during implementation? [Design Clarity, Plan §OP-01–09; Contracts §2–6; Data §3; Frontend §F02–F07]
- [x] CHK033 Are Arabic/RTL/Cairo preservation, current control kinds, accessible feedback, keyboard/focus expectations and narrow/wide presentation requirements complete for the identified surfaces? [Completeness, Accessibility Coverage, Spec §FR-027; Plan §OP-07–08; Frontend §F01/F04–F08]
- [x] CHK034 Are privacy, bounded work and relevant quality constraints explicit, with unsupported service-level or scale assumptions excluded rather than silently invented? [Non-Functional Clarity, Spec §Authority and Data Rules; Plan §Technical Context; Contracts §2/5; Data §4]
- [x] CHK035 Does the planned TASKS handoff require bounded briefs, dependencies, context and completion evidence while treating future briefs and executed checks as pending outputs? [Handoff Clarity, Plan §Review coverage and producing-stage handoff; Frontend §F09]
- [x] CHK036 Are material decisions, assumptions, exclusions and any unresolved conflicts assigned to clear owners instead of being hidden behind a general readiness verdict? [Ambiguity Coverage, Spec §Assumptions and Decisions; Plan §Constitution Check; Plan §Design Readiness and Exit; Frontend §F09]

## Review Notes

- Generated 36 new questions, CHK001–CHK036, for reviewer-owned assessment of the current written spec/design. No item has been evaluated or marked approved by this generation.
- Record concise written-artifact evidence or a specific missing/contradictory requirement against each reviewed CHK ID. Keep unresolved findings explicit; a reference attached to a question is not a passing verdict.
- This checklist does not request implementation, runtime acceptance, test execution, new task briefs or release evidence now. Such outputs belong to their later authorized stages.
- Preserve prior items and their markers on later append operations. This run leaves the built-in requirements checklist, specification, technical plan and supporting designs unchanged.

## Requirements Review — 2026-11-05 (T001)

Reviewed before any application implementation under the explicit Group 1 IMPLEMENT request. All 36 criteria pass at the written-requirements/design level. The built-in checklist is reused unchanged. No checked item claims implemented behavior, an executed application test or backend/phase/release acceptance. The generation notes above remain historical.

| Item   | Written-artifact evidence supporting approval                                                                                                                                    |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CHK001 | Spec Scope and Plan Summary select P02/002-shared-customers-drafts, matching root roadmap P02; later phases and deletion/import/redesign are excluded.                           |
| CHK002 | Spec Baseline and Plan foundation ledger distinguish real P01 authority/session exports, historical local acceptance and absent P02 producers.                                   |
| CHK003 | Spec client gates and FR-011/024 permit incomplete save while catalog activation, submission, NUM-01 and OPS-01 retain their later owners.                                       |
| CHK004 | Spec FR-027 and Frontend F01 identify reached Arabic/RTL/Cairo surfaces and local-state defects; provider removal, fixture import and redesign are excluded.                     |
| CHK005 | FR-002–005 and Contracts §2–3 require name/phone, allow optional contact fields, enforce phone uniqueness and permit repeated email.                                             |
| CHK006 | FR-003/D-001 and Contracts §2 fix local/+966/00966 equivalence, both digit scripts, rejected forms, fragment search and exact phone resolution.                                  |
| CHK007 | FR-005/011–014, Contracts §3 and Frontend F05 distinguish omitted patches, explicit clears, complete PUT replacement and retained significant/hidden text.                       |
| CHK008 | FR-006/010/015–016 and Data §1–2 separate immutable UUID relations from phone, display position and future business numbering.                                                   |
| CHK009 | Spec Edge Cases and Frontend F04 define exact missing resolution, multiple name matches, explicit selection and no permanent old-phone alias.                                    |
| CHK010 | FR-007/017–019, Data §4 and Frontend F06 scope related drafts/counts/measurements/activity by owner, with explicit ADMIN breadth.                                                |
| CHK011 | US5/FR-019, Contracts §5 and Data §3 define current actor checks, account locks, safe foreign/missing outcomes and unchanged rejected state.                                     |
| CHK012 | US2/FR-008–009 and Frontend F03–F04 separate confirmed customer selection, explicit paper save, unsent cancel and pending/unknown dismissal.                                     |
| CHK013 | US3/FR-010–011 and Contracts §3 admit SHOP/other known types with one blank row and no customer/date/specifications/quote/number.                                                |
| CHK014 | FR-012, Contracts §3 and Frontend F05 enumerate independent piece/header captures, soleAddition/additions, M1/M2/M3/face and repair/adjustment text.                             |
| CHK015 | FR-013–014/022–024 and Data §1 distinguish date-only values, actual actor/time, signature text, provisional exact paid entry and unavailable authoritative finance.              |
| CHK016 | US4/FR-015–016 and Data §1–3 specify new copy UUIDs, retained IDs, tombstones, resequencing and the final-row minimum.                                                           |
| CHK017 | FR-011/015/021–022 and OP-03/05–06 specify explicit manual aggregate save with resource/version/pieces/receipt committed or rolled back together.                                |
| CHK018 | FR-004/020, US1/US6 and Contracts §5 distinguish unique-phone collision from stale revision; neither overwrites the winner or discards losing input.                             |
| CHK019 | FR-021/025–026, SC-006 and OP-06 distinguish frozen same-intent replay, changed binding, immutable saved after-image and separately fetched current data.                        |
| CHK020 | SC-006, OP-06 and T024 step 5 distinguish current-attempt rejection, an earlier possible commit and confirmed-write refresh failure. A1 below remains a wording advisory.        |
| CHK021 | FR-020/025–027 and Frontend F02–F05 fix dirty retention, pending input locks, explicit reload/review and scope/form-token guarded callbacks.                                     |
| CHK022 | Contracts §2–4, Data §4 and Frontend F02/F06 agree on bounded page/limit, supported filters, deterministic ordering and count/summary scopes.                                    |
| CHK023 | FR-007/018/024–025 and Frontend F05–F07 distinguish provisional draft measurements, unavailable P03 data/prices and real empty/error states.                                     |
| CHK024 | SC-001–008 define observable identity, persistence, privacy, conflict/recovery, readiness and retained interaction outcomes without invented scale targets.                      |
| CHK025 | Spec Concrete Acceptance Examples identify synthetic actors, starting records, representative inputs, results and failure-state preservation, including lost replies.            |
| CHK026 | VR-001–005 and Plan Verification assign real PostgreSQL/HTTP/React/browser claims and distinguish planned checks, inspected source and historical evidence.                      |
| CHK027 | VR-005, Plan delivery groups and T018/T037/T042 require complete backend acceptance before frontend, then integrated phase evidence and separate release status.                 |
| CHK028 | OP-05 explicitly defers real persisted non-DRAFT races until P03; Plan/Frontend F09 state absent-capability and missing-infrastructure limits.                                   |
| CHK029 | FR-022, OP-09 and Data §2/5 preserve prior migrations/P01 rows, retain command history and require owned targets and forward recovery.                                           |
| CHK030 | OP-01–09 each identify requirements, concrete algorithms, outcomes and verification; the task coverage table traces all FR/SC/VR criteria.                                       |
| CHK031 | Plan foundation ledger, Contracts §6 and Frontend F01 distinguish existing exports from proposed producer outputs; T024 resolves the A1 shorthand explicitly.                    |
| CHK032 | OP-01–09, Data §3, Contracts §5–6 and Frontend F02–F07 fix lock/CAS/replay/DTO/cache/form decisions; T024 supplies the explicit sticky-uncertainty branch.                       |
| CHK033 | FR-027 and Frontend F01/F04–F08 retain control kinds/layout, Arabic/RTL/Cairo, input-associated feedback, keyboard/focus and desktop/narrow acceptance.                          |
| CHK034 | Spec Authority/Data rules, Contracts §2/5 and Data §4 fix privacy, input/page/payload bounds and set-based queries without an unsupported SLA.                                   |
| CHK035 | Plan handoff requirements and the completed Task Briefs require per-ID files, dependencies, context, invariants and concrete proof; execution remains future evidence.           |
| CHK036 | Spec Decisions, Plan readiness and Frontend F09 identify owners/exclusions; the two nonblocking analysis advisories below remain explicit rather than waived or silently edited. |

### Retained analysis advisories

- **A1 / MEDIUM / frontend design owner**: Frontend F03's rejection shorthand should explicitly qualify the current attempt and preserve any earlier unresolved intent. Spec FR-021/SC-006, OP-06 and T024 step 5 already fix that behavior and its unknown→403/409 checks; no material product or implementation decision is open. This intake does not amend F03.
- **U1 / LOW / T031 context owner**: The existing direct metadata test callers `apps/web/src/features/orders/order-types.test.tsx` and `apps/web/src/features/orders/components/adjustment-paper-fields.test.tsx` are useful additional regression references. T031 already requires compatible callers; no accepted signature requires a new mandatory prop. This intake does not amend its brief.

Requirements-quality verdict: **PASS**, CHK001–CHK036. Application behavior, meaningful runtime tests, backend/frontend/browser/P02 acceptance and release remain unperformed by T001. Checklist markers become read-only for subsequent code work; a newly discovered material requirement must return to its owning step.
