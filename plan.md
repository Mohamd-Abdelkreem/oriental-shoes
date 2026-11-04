# Oriental Shoes: Backend and Frontend Integration Roadmap

**Decision baseline:** November 3, 2026; includes the received workbook mapping and decoration-based price rule.\
**Source baseline:** `06bb580d22788d81447cacdeff3e3010faeaa440`.\
**Scope:** Exactly eight implementation phases, P01–P08. Preserve the existing frontend and build the backend needed by its pages, forms, tables, dialogs, tracking, and printing.\
**Status:** Draft for owner review. No phase is implemented or completed by creating this file. No application tests were rerun while preparing this roadmap.

## 1. How to use this roadmap

This root `plan.md` is the project roadmap and agreed business-rule baseline. It is distinct from a technical `specs/<feature>/plan.md` generated later by Spec Kit. Oscar's plan informed the sequencing and delivery gates; its financial domain and phase numbering do not apply here.

1. Review and approve this roadmap before implementing application changes. Then select one phase and a bounded task range.
2. Use one coherent Spec Kit specification, technical plan, and task list for each selected phase. A task batch is not another formal phase. Preserve existing accepted artifacts and task IDs when resuming.
3. Within every phase, complete the applicable database migrations, contracts, authorization, business services, HTTP endpoints, and backend tests **before** connecting that phase's frontend. A backend gate alone does not complete a phase.
4. Connect existing pages and dialogs to the tested backend, then run frontend integration and browser acceptance. Do not rebuild dashboards, add an alternative application, remove operational pages, or redesign the approved UI.
5. Small changes needed to enforce agreed behavior are in scope: real identities, binding authoritative prices to existing read-only cells, incomplete draft validation, free-text approval return reasons, pending-account screens, correct permissions, loading/errors, and removal of obsolete routing claims. The owner has already implemented the confirmed paper text fields, middle floor-addition column, and read-only price presentation. Preserve those controls and bind the received values; do not schedule their reconstruction.
6. Do not connect a button to mock success, accept browser-supplied authority, or silently fall back to local fixtures when an API fails. Converted screens use real persisted data. Empty data is valid; fabricated production data is not.
7. At a blocked task, identify the dependency and continue independent work in the selected scope. Leave the task open. Never mark a phase complete while its client-input or acceptance gate is outstanding.
8. Report the phase/task range, changes, migrations, tests actually run, outcomes, and remaining dependencies. This roadmap does not authorize commits, pushes, production deployment, database resets, or importing client data now.

### Spec Kit and repository prerequisites

Spec Kit 1.2.5 is already installed for Codex and MiniMax; Codex is the current default in `.specify/integration.json`. Preserve the installation and project-owned adapters/overrides. At the November 3 working-tree review, the adopted `.specify/memory/constitution.md` version 1.0.0, root `AGENTS.md`, and engineering/workflow guides are present as separate documentation work. Read and reuse them; do not recreate the constitution or treat their adoption as approval to implement a phase. Follow `docs/engineering/README.md` and `docs/workflow/phase-delivery.md` for later selected-feature work. This roadmap update selects no feature or Spec Kit command and adds no setup phase.

Read applicable repository instructions and the installed Next.js guides before framework-dependent implementation. Keep the existing Next.js/React, Express, shared contracts, Prisma/PostgreSQL, Axios, React Query, and test infrastructure.

## 2. Verified starting point and review coverage

- Real authentication, email verification/recovery, refresh rotation, CSRF, profile updates, password change, and session controls already exist. Extend them rather than rebuilding authentication.
- `apps/api/src/router.ts` currently composes auth, users/profile, health, and OpenAPI. There are no operational customer, order, manufacturing, warehouse, or reporting API modules yet.
- `packages/database/prisma/schema.prisma` currently contains `User` and `RefreshToken`, generic `USER`/`ADMIN` roles, and verification/active/suspended account states. Employee department approval remains to be implemented.
- Operational employees, customers, orders, pieces, quantities, movements, and reports still depend on `features/prototype/state` and browser-local storage. Production must not import its fixture passwords, identities, orders, or role state.
- The route inventory has **102 page definitions: 84 screen definitions and 18 redirects**. Every current route has an owner in Appendix A. Reusable components inside a directory called `prototype` are not automatically disposable previews.
- Existing API/database integration tests use disposable PostgreSQL Testcontainers and real migrations; browser component tests use Vitest/jsdom/Testing Library. There is no configured automated browser end-to-end suite yet.
- The checked-in Compose setup provisions PostgreSQL only. `Caddyfile` is a proxy template, not evidence of a completed deployment.
- `README.md`, `PROJECT_REFERENCE.md`, and `docs/FRONTEND_MIGRATION_AUDIT.md` describe the earlier foundation/migration. Their demo behavior and historical checks are not proof that this roadmap has been implemented.

The renewed source review covered backend/contracts/database, current route wrappers, all operational feature modules and dialog handlers, authentication/account/transport/shared code, tests, configuration, and print/style boundaries. Dependencies, generated/build output, and binary assets are not business specifications. Installed Spec Kit files were inventoried as tooling, not treated as product requirements.

### Changes since the earlier application report

| Commit    | Consequence for this roadmap                                                                                                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `502201e` | Special operations was removed; compatibility code maps old demo state to production. It must not become a new backend department.                                                              |
| `fcdd06a` | Shared piece/order actions and tracking were reorganized; retain the current progress and piece-location presentation.                                                                          |
| `a405708` | Department dashboards, counts, filters, and links were consolidated; implement consistent queries for them.                                                                                     |
| `06c95ee` | Seven order types, adjustment fields, and shared warehouse detail components are now part of the delivery surface.                                                                              |
| `97cb7a9` | Batch selection, problem reporting, quality inspection, delivery failure, and warehouse queues need complete backend commands.                                                                  |
| `15e95f1` | Warehouse receipt is distinct from manufacturing work; incomplete orders exclude dispatched, failed-delivery, and delivered orders.                                                             |
| `0ab9605` | Reports/printing and pagination were reorganized; filters, totals, and page counts must come from real data.                                                                                    |
| `19dc11a` | Preserve searchable paper cells, portal menus, paper row handling, eight-row print pagination, A4 landscape order paper, and A4 portrait reports.                                               |
| `717711d` | Spec Kit is installed for both coding tools; this is tooling installation, not completed product planning or implementation.                                                                    |
| `06bb580` | Confirmed paper text fields, middle `soleAddition`, and read-only price/total display are implemented; retain them. Catalog data loading and authoritative Z/AA lookup remain integration work. |

### Known differences to correct during integration

These are required wiring/state/text corrections, not authorization for a redesign:

- Repair still bypasses cutting in current approval actions and some labels. The agreed rule below supersedes this behavior for **all seven** types.
- Current draft save enforces submission-like fields. Incomplete drafts must be allowed.
- Some sales lists and actors use fixed names; others are not owner-scoped. Use authenticated user IDs and real server authorization throughout.
- Approval return reasons still use a preset dropdown. Replace it with mandatory free text, retaining the existing dialog.
- Sales problem resolution currently resumes manufacturing directly and offers cancellation. Revised specifications must return for approval; sales cannot execute post-submission cancellation.
- Some worker controls prevent colleagues continuing another worker's task. Same-department continuation is allowed and audited.
- Quality acceptance currently contributes to warehouse completion before physical receipt. Those are separate states.
- Per-piece and quantity-segment state can disagree; required quantity can deduct cancellations twice; legacy receipt can count twice. Do not port these defects into the backend.
- Print layout currently requires generic ADMIN while page-level checks use local role state. Replace both with agreed server-backed permissions.
- Current option arrays still contain demonstration values, including accessories in `SOLE_ADDITION_OPTIONS` instead of the workbook's floor types. Replace their data source during integration; do not rebuild the table. M1/M2/M3/face and final additions are already free text, and financial cells are already read-only. The current cells display stored amounts with a demo zero fallback; that is not a completed authoritative decoration-price lookup. Measurement placement, box presentation, and the existing layout are preserved while wiring their data; sample values, fixed dates, ID examples, and fabricated signatures are not production authority.

## 3. Agreed business rules

| ID    | Rule                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BR-01 | Workspaces are administration, sales/exhibitions, approval, cutting, production/repair, quality/packing, and warehouse/delivery. Special operations is removed.                                                                                                                                                                                                           |
| BR-02 | All seven current types—`SHOP`, `EXTERNAL`, `REPAIR`, `GIFT`, `READY`, `ACCESSORY`, `ADJUSTMENT`—use the same full approval → cutting → production → quality → warehouse/delivery path. No repair or adjustment shortcut.                                                                                                                                                 |
| BR-03 | Employees self-register, verify email, then wait for administrator approval and department assignment. Verification alone grants no operational authority. Each employee has one department; ADMIN has cross-department authority.                                                                                                                                        |
| BR-04 | A worker starting a piece is recorded automatically. Another active worker in that department may continue it. Record the actual actor of every action; no supervisor/assignment platform is required.                                                                                                                                                                    |
| BR-05 | Customer directory is shared. Normalized phone uniqueness prevents duplicate customers. Sales can create/update basic customer data; each salesperson can access only their own orders, drafts, order history, and sales activity. ADMIN has the agreed broader view. Shared customer details must not leak another salesperson's orders or measurement history.          |
| BR-06 | A draft may lack a customer or specifications. Full client-approved validation applies at first submission. Customer email is optional; submitted orders require a linked customer. Inline customer creation returns the actual saved customer and links it to the current form.                                                                                          |
| BR-07 | Salesperson identity/name and action timestamps come from the authenticated server context. They are not editable authority fields. Dates use real validated dates, not demo values or a fixed year.                                                                                                                                                                      |
| BR-08 | Unit price is determined only by the selected decoration: workbook Z identifies it and the same row's AA cell supplies its price. First submission freezes customer contact/address and those prices. Later customer/catalog changes do not rewrite submitted orders. Prices remain read-only to sales; model, size, color, floor, and additions are not price modifiers. |
| BR-09 | Submission locks sales specification edits. Approval may approve or return the order for correction, with a mandatory free-text reason. Returned orders can be corrected and resubmitted. Preserve earlier submissions and decisions in the activity record.                                                                                                              |
| BR-10 | Each physical piece has a stable ID and an independent lifecycle. A problem affects that piece only; other pieces continue. Batch controls operate on selected eligible piece IDs without losing individual identity.                                                                                                                                                     |
| BR-11 | An approver resolves a manufacturing problem by returning the piece to cutting/production, sending it to sales for customer communication, or cancelling that piece. Record the decision and notes.                                                                                                                                                                       |
| BR-12 | After sales changes a problem piece, it returns to approval before manufacturing resumes. Sales can request cancellation; approval executes it. Do not turn this into editing/reapproving unaffected pieces.                                                                                                                                                              |
| BR-13 | Quality rejection returns a piece to cutting or production. It then follows the normal downstream route: cutting → production → quality, or production → quality. Correction cycles and instructions remain traceable.                                                                                                                                                    |
| BR-14 | Quality acceptance/packing makes a piece incoming to warehouse. Only explicit physical warehouse receipt counts as completed in warehouse and contributes to the accepted completion percentage.                                                                                                                                                                          |
| BR-15 | Delivery is whole-order only after all noncancelled pieces are physically received. Partial manufacturing/receipt is allowed; partial customer delivery is not.                                                                                                                                                                                                           |
| BR-16 | Recording delivery failure in warehouse confirms the goods physically returned there. Retry returns the order to ready; a retry date is optional. Warehouse staff record dispatch and delivery results; no courier account/dashboard is added.                                                                                                                            |
| BR-17 | The owner salesperson and ADMIN can update cumulative paid amount after approval. Persist old/new amounts, actor, and time; this exception does not unlock specifications. No separate invoicing/payment gateway/accounting system is required.                                                                                                                           |
| BR-18 | Cancelling pieces recalculates total while preserving actual paid amount. If paid exceeds the revised total, show the surplus owed to the customer. Settlement is external; no automatic refund.                                                                                                                                                                          |
| BR-19 | Administrative reopening permits audited corrections to notes, contact data, and delivery address only. It does not change specifications/prices, reactivate cancellations, rewind completed work, or rewrite delivery history. Repair after delivery is a new repair order using the same full path.                                                                     |
| BR-20 | Sales, approval, and ADMIN can print the official order after approval. Factory workers can read manufacturing specifications without prices, paid amount, or balance. Enforce the projection in the API, not only with CSS.                                                                                                                                              |
| BR-21 | Preserve current progress percentage and per-piece location/status tracking. Preserve the existing printable paper and browser Print/Save as PDF; no separate PDF service is required.                                                                                                                                                                                    |
| BR-22 | Demo data stays in development/test. Production starts with fresh operational data unless a specific real import is supplied and separately reviewed. Final delivery includes runtime/mail/backup/restore readiness.                                                                                                                                                      |

Approval cancellation retains a cancelled piece and its reason/history instead of physically erasing it. Derive original count, cancelled count, active count, received count, and completion from the same persisted records. Count each piece once. A fully cancelled order is not a deliverable 100%-complete order.

Customer-master updates and explicit administrative order corrections are different actions. The first affects future orders; the second is an authorized correction to one retained order snapshot with an audit trail.

## 4. Received catalog values, confirmed pricing, and remaining gates

**Client update received November 3, 2026:** Field sources, the specified text fields, the extra middle floor column, measurement values, and decoration-only pricing are now confirmed. They are no longer broad pending-client-meeting dependencies. The owner has already completed the table/control changes in the frontend. Remaining work is database value loading, authoritative lookup/validation, and integration with those existing controls.

This update changes documentation only. It does not load a database, activate a catalog, implement a pricing API, or complete P03.

### Source workbook and import boundary

- Source: [client workbook](</Users/mohamedabdelkareem/Downloads/أمر_تفصيل_الحذاء_الشرقي (1).xlsx>), worksheet `القوائم`, populated source extent `A1:AA942`. This is the new file, not the earlier workbook whose size list was incomplete.
- Source SHA-256: `88acb9b4b0389b86d75c191fa7a3201a27f0d387dd1098f45562a8ff02753e9b`. The workbook is supplied outside Git; make the reviewed source available to the selected implementation environment and verify its identity before loading it. A changed file requires a new comparison, not silent replacement.
- Use evaluated cell values. Some decoration labels in Z and base values in I are formulas; store their resolved values, not Excel formula strings. The received file's formula caches were compared with the supplied table; no recalculation is claimed by this documentation update.
- Headers and color-count statistics are not options. Exclude the statistic cells in row 104 from color lists, but do not discard that whole row: `I104` contains a legitimate base value.
- **Source-language fidelity is mandatory:** catalog names and values must be stored and displayed exactly in the language supplied by Excel. Arabic stays Arabic, English stays English, and mixed Arabic/English stays together as supplied. Do not translate, transliterate, replace, or abbreviate labels. Preserve codes, punctuation, leading zeroes, and letter case in selections, order details, corrections, and printing. The roadmap's explanatory prose and technical identifiers remain English; its literal catalog labels below are copied from Excel.
- Retain source family grouping and original display strings. Any whitespace normalization used internally for lookup or duplicate detection must not overwrite the original display value. Do not merge distinct catalog kinds by a shared short code.
- The full allowed values are the cells in the ranges below. Do not replace the base list with a union of color lists, fill blank source cells by guesswork, or use demo arrays as an additional production source. No workbook-upload screen, catalog-management page, or generic form engine is required.

### Confirmed field-to-column mapping

| Existing paper field                | Current data key  | Workbook source                                                                        | Confirmed behavior and values                                                                                                                                                               |
| ----------------------------------- | ----------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decoration                          | `decoration`      | `Z3:Z16`                                                                               | Existing searchable selection; 14 supplied decoration choices. This selection alone determines unit price.                                                                                  |
| Decoration color                    | `decorationColor` | Families in `L2:Y2`; their values in rows 3–72, except `سادة - S` in T through row 102 | Existing selection supplied as grouped leather/color families; 1,010 actual color options. Preserve every family's own options.                                                             |
| Base                                | `leatherBase`     | `I3:I592`                                                                              | Existing selection; 590 evaluated values exactly from I. Do not substitute all L–Y colors for this list.                                                                                    |
| M1                                  | `faceRight`       | No lookup column                                                                       | Free text already implemented.                                                                                                                                                              |
| M2                                  | `faceLeft`        | No lookup column                                                                       | Free text already implemented.                                                                                                                                                              |
| M3                                  | `mixing`          | No lookup column                                                                       | Free text already implemented.                                                                                                                                                              |
| Face                                | `face`            | No lookup column                                                                       | Free text already implemented.                                                                                                                                                              |
| Model                               | `model`           | `A3:A9`                                                                                | `SM`, `STN`, `ST`, `SH`, `R15`, `SLEEPR`, `SF`.                                                                                                                                             |
| Floor: type/model                   | `sole`            | `C3:C14`                                                                               | 12 model entries, using the source text exactly: `RD1/2`, `RD`, `N`, `RO`, `RP`, `روضه - H`, `طبي - TAPI`, `RC`, `RM1/2`, `R.R`, `N.D`, `N1/2`.                                             |
| Floor: middle addition              | `soleAddition`    | `B3:B7`                                                                                | Five supplied floor types: `روضة - H`, `مكسي - X`, `مربع - S`, `كعب - K`, `تكتك - T`. The column already exists between `sole` and `soleColor`; replace sample option data, not the column. |
| Floor: color number                 | `soleColor`       | `D3:D42`                                                                               | Integer color numbers 1–40.                                                                                                                                                                 |
| Final additions                     | `additions`       | No lookup column                                                                       | Existing final free-text field. It is separate from the middle floor `soleAddition` selection.                                                                                              |
| Size                                | `size`            | `E3:E57`                                                                               | 55 explicit values from 25 through 52 in steps of 0.5: 25, 25.5, 26, 26.5, and so on. These values are present in the new workbook and confirmed by the owner.                              |
| A / Arch                            | `aField`          | `F3:F83`                                                                               | 81 values from 10 through 50 in steps of 0.5; bind the supplied values using the existing measurement controls.                                                                             |
| F / finger measurement, centimetres | `fField`          | `G3:G62`                                                                               | 60 values from 1 through 30.5 in steps of 0.5; the paper's F field comes from workbook G, not workbook F. Preserve existing measurement placement.                                          |
| Unit price                          | `unitPrice`       | `AA3:AA16`, joined to Z on the same row                                                | Server-authoritative decoration lookup, rendered in the already read-only price cell. No salesperson price entry.                                                                           |

The floor section order remains `sole` → `soleAddition` → `soleColor`, followed by the separate final `additions` text field. Preserve the completed table layout, text inputs, column order, read-only/print output, and quantity of one piece per row. Do not reclassify M1/M2/M3/face/final additions as dropdowns. Do not infer new requiredness, tax, conditional form rules, measurement scope changes, or bottom-box business behavior from this data update; retain existing agreed behavior and limit implementation to persistence, values, and binding.

### Decoration-color families

| Workbook column | Source family label (verbatim from Excel) | Value cells |
| --------------- | ----------------------------------------- | ----------- |
| L               | `نعام - O`                                | `L3:L72`    |
| M               | `تمساح - مطفي `                           | `M3:M72`    |
| N               | `تمساح - C`                               | `N3:N72`    |
| O               | `لازار - L`                               | `O3:O72`    |
| P               | `ثعبان - مطفي`                            | `P3:P72`    |
| Q               | `ثعبان - P`                               | `Q3:Q72`    |
| R               | `سمك - F`                                 | `R3:R72`    |
| S               | `نابا - N`                                | `S3:S72`    |
| T               | `سادة - S`                                | `T3:T102`   |
| U               | `سادة مطفي - M`                           | `U3:U72`    |
| V               | `حصان - H`                                | `V3:V72`    |
| W               | `ساق نعام - OL`                           | `W3:W72`    |
| X               | `شمواه - V`                               | `X3:X72`    |
| Y               | `تمساح بيبي - CB`                         | `Y3:Y72`    |

These are grouped options, not a newly approved rule that selecting Z automatically restricts colors to a matching family. Do not invent that dependency. Two source asymmetries remain recorded without modifying the data: Z contains `زبيري - z` without a corresponding color column in L–Y; Y contains `تمساح بيبي - CB` colors without a decoration or price row in Z/AA. Preserve the supplied choices and groups; do not invent missing colors, add a decoration/rate, or delete supplied colors. This does not block implementing the confirmed independent lists or the existing Z/AA prices. Any later requirement for a matching-family restriction must explicitly resolve those cases first.

### Confirmed automatic price table

The owner confirmed the rule: **selected decoration in Z → numeric price from AA on that same source row**. Decoration labels below are the actual resolved Excel strings, preserving their Arabic/English text and source codes. The selection key must resolve to that retained source record. Do not price by model, size, base, color, floor model, floor addition, or final free-text additions, and do not introduce surcharges or discounts.

| Source cells   | Decoration label (verbatim from Z) | Unit price |
| -------------- | ---------------------------------- | ---------: |
| `Z3` → `AA3`   | `زبيري - z`                        |       1800 |
| `Z4` → `AA4`   | `نعام - O`                         |       1500 |
| `Z5` → `AA5`   | `تمساح - مطفي `                    |       1500 |
| `Z6` → `AA6`   | `تمساح - C`                        |       1500 |
| `Z7` → `AA7`   | `لازار - L`                        |        850 |
| `Z8` → `AA8`   | `ثعبان - مطفي`                     |        950 |
| `Z9` → `AA9`   | `ثعبان - P`                        |        950 |
| `Z10` → `AA10` | `سمك - F`                          |        800 |
| `Z11` → `AA11` | `نابا - N`                         |        750 |
| `Z12` → `AA12` | `سادة - S`                         |        650 |
| `Z13` → `AA13` | `سادة مطفي - M`                    |        650 |
| `Z14` → `AA14` | `حصان - H`                         |        950 |
| `Z15` → `AA15` | `ساق نعام - OL`                    |       1100 |
| `Z16` → `AA16` | `شمواه - v`                        |        500 |

While editing an unsubmitted draft, changing decoration obtains the corresponding backend quote and updates the existing read-only amount/totals. Empty or unknown decoration, a missing/non-numeric rate, or conflicting duplicate rates produces an unavailable quote and a visible validation result, not zero/free-product pricing or manual override. Reject authoritative price/totals supplied by sales. First submission persists the selected decoration and quoted amount/provenance, and freezes that price under BR-08; subsequent rate changes do not rewrite submitted pieces. Use the existing exact-money conventions and the supplied amounts without inventing conversion, tax, or additional rounding rules.

### Input status versus implementation status

| Dependency | State after this update                                                                                    | Remaining work or evidence                                                                                                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CAT-01     | Confirmed: field sources, specified control kinds, column placement, and supplied measurement values       | Bind the existing controls/contracts to the mapping above and verify persistence, correction, read-only and print parity. Do not wait for the same mapping again.                                                                                 |
| CAT-02     | Received: authoritative workbook values and source identity; not loaded into a database                    | During selected P03 implementation, preview/validate the evaluated values and counts, preserve the recorded asymmetries, perform the authorized loading, and test the real persisted catalog. This plan-only edit performs none of those actions. |
| PRC-01     | Confirmed: decoration-only key and all 14 same-row Z/AA rates; read-only price presentation already exists | Implement/test authoritative lookup, quote binding, invalid-rate handling, override rejection, totals, and first-submission freeze. Current read-only/demo amounts are not proof that lookup exists.                                              |
| NUM-01     | Still pending client confirmation                                                                          | Display-number pattern, sequence/reset scope, and confirmed examples are required before issuing real business order numbers.                                                                                                                     |
| OPS-01     | Resolve before release                                                                                     | Confirm target hosting/domain, mail, business-date timezone, initial administrator, backup/restore arrangements, and operational owner; verify them in P08.                                                                                       |

### Ready work and blocked production actions

- P01 and P02 remain ready without catalog activation or the final business-number pattern. P02 persists the already implemented fields, including `soleAddition`, and incomplete drafts.
- P03 catalog and decoration-pricing work now has the required source values and lookup rule. It can be implemented after its upstream backend gates; do not leave it waiting for the old general field/pricing meeting.
- Data receipt is not database activation or implementation completion. Before a real submission, finish catalog loading/validation, authoritative quote/submission code, backend/frontend tests, and the remaining NUM-01 confirmation. NUM-01 still prevents final business-number issuance, but does not block catalog or pricing development.
- Missing runtime price data means **unpriced/unavailable**, not a valid zero-price quote. Preserve first-submission snapshots, paid-update authority, and all downstream lifecycle rules.
- Downstream backend tests may use disposable submitted-order fixtures after the upstream domain-contract gate. They do not prove production submission or catalog activation.
- A dependent frontend connects only after its own entire backend gate passes. Bind the actual values and quotes to the accepted controls; real empty lists must not fall back to demonstrations.
- Execute within P01–P08. If numbering or another actual remaining prerequisite is unresolved, report that specific limit and continue independent work in the selected scope. Do not add a ninth phase or rebuild completed frontend work.

### Later amendments

When remaining information arrives, update only its dependency row and affected phase specification/contracts/tasks/tests. Retain the received mapping and decoration-only price rule unless the owner explicitly changes them. A new workbook revision needs a comparison against the recorded source, validation of affected options/rates, and snapshot regression tests before loading. Preserve existing submitted prices and customer snapshots. Keep all changes in the same eight phases and report actual implementation/activation evidence separately from received requirements.

## 5. Implementation shape and shared acceptance rules

- Use a modular Express application in the existing API, shared request/response validation in `packages/contracts`, Prisma migrations in `packages/database`, and the existing centralized Axios/React Query frontend integration.
- Use stable internal user/customer/order/piece/issue/decision/event identifiers. Keep business display numbers separate from route/persistence identity. Do not derive IDs from array length, mutable phone numbers, names, or browser state.
- Keep the existing phone-based customer URLs working through an adapter/resolution layer while using stable customer identity internally. Changing a customer's phone must not detach orders or resolve an unknown route to the first customer.
- Treat persisted per-piece state as authoritative. Grouped orders, selected batches, counters, queues, timelines, totals, and existing quantity-segment presentation are projections. Do not maintain independent competing piece and segment ledgers.
- Use ordinary PostgreSQL transactions, state preconditions, uniqueness constraints, and version/conflict checks for commands. Retrying a committed submit/approval/receipt/dispatch/payment command must not duplicate its effect. A stale or invalid command returns a visible conflict and refetch path.
- Record state change and audit entry together. Audit includes actor ID/name at action time, department, order/piece reference, server timestamp, reason/notes, and relevant before/after values. Keep the implementation scoped to these business records; no event bus, microservices, generic workflow engine, configurable form-builder platform, or general accounting ledger.
- API outputs depend on role and ownership. Factory responses omit financial fields and inaccessible orders; filtering only in JSX is insufficient. Reject attempts to set actor, role, approval, location, counters, frozen prices, or delivery status outside authorized commands.
- Store/calculate money with exact decimal handling and serialize through the existing conventions. Server totals are authoritative. Keep total, paid, remaining due, and surplus distinguishable; never hide an overpayment by overwriting paid or clamping its evidence away.
- Order creation/contact/price snapshots need only retained business values and provenance. Avoid a generic snapshot/version registry. Preserve first-submission prices through returns/resubmissions; do not silently reprice an already submitted piece after a catalog change. If a later client rule requires repricing or changes the meaning of a frozen product, amend that rule explicitly before implementing it.
- Reuse existing loading, empty, field-error, toast, and confirmation patterns. Show success after confirmed persistence. Keep form input on recoverable error and invalidate/refetch affected lists, details, counters, and histories after success.
- Keep server timestamps and validated date-only promised/retry dates separate. Use an explicit business-date timezone for overdue calculations; remove fixed demo clocks and string/ISO-date divergence.
- Add backend unit tests for every new or changed business function, contract tests for shared boundaries, and real database/HTTP integration for persisted behavior. Use frontend integration/browser tests for user-facing commands. Do not substitute snapshots or mocked success for real acceptance, and do not duplicate tests merely to count trivial wrappers.

## 6. Eight-phase overview

All backend/integration phase statuses below are **not started**. The completed frontend controls remain the baseline; receipt of the catalog and pricing rule does not mean their backend is implemented.

| Phase | Delivery                                                                                  | Dependencies                                                                      | Readiness                                                                                                          |
| ----- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| P01   | Staff identity, administrator approval, department access, accounts                       | Approved roadmap; project constitution before feature execution                   | Business rules ready; no catalog dependency                                                                        |
| P02   | Shared customers, persistent incomplete drafts, ownership/audit foundation                | P01 authorization/contracts                                                       | Ready without client catalog/prices/numbering                                                                      |
| P03   | Confirmed catalog/pricing, sales submission, frozen paper data, sales read models         | P02; confirmed CAT/PRC inputs available; NUM-01 before final numbering/submission | Catalog and pricing implementation can proceed after P02; activation/tests are exit gates; numbering still pending |
| P04   | Order approval/return, per-piece problem decisions, sales reapproval loop, official print | P03 stable submitted-order/price/snapshot contracts                               | Backend can be tested after contract gate; real orders require P03 activation/acceptance and NUM-01                |
| P05   | Cutting and production, per-piece/batch work and manufacturing problem reporting          | P04 issue/approval/release commands                                               | Depends on upstream backend gates                                                                                  |
| P06   | Quality, packing, rejection/correction cycles and warehouse handoff                       | P05 normal route and correction contracts                                         | Depends on upstream backend gates                                                                                  |
| P07   | Physical warehouse receipt, reconciliation, whole-order delivery/failure/retry            | P06 accepted-piece handoff                                                        | Depends on upstream backend gates                                                                                  |
| P08   | Administration, reports, full regression, production readiness and cutover                | Domain contracts for early read-model work; P01–P07 complete for release; OPS-01  | Aggregate work can prepare earlier; final release gate waits for all dependencies                                  |

## P01 — Staff identity, approval, department authorization, and accounts

**Outcome:** Employees reach only their assigned workspace after verification and administrator approval. ADMIN can manage staff and access the agreed sections. Existing account functionality remains real and working.

### Backend delivery

- Read and reuse the adopted constitution, root instructions, engineering guides, and phase-delivery contract before the selected feature workflow. Verify the P01/feature mapping and authorized scope; preserve existing governance and tooling rather than regenerating them.
- Extend the existing user/account state and shared contracts for pending administrator review, rejection, active/suspended state, and exactly one employee department. Design migrations deliberately; do not silently approve or assign existing generic USER accounts to sales.
- Keep self-registration/email verification/password recovery. Verification leaves the employee awaiting admin approval; it must not activate manufacturing authority.
- Implement staff list/search/pending queries and existing approve, reject, assign/change department, suspend, and reactivate operations. Administrator authority and real actor/time are mandatory. Never return password hashes or fixture passwords.
- Provide current-user status/department and safe post-login navigation. Pending/rejected/suspended status must be available only in an authenticated or credential-validated context without public email enumeration.
- Enforce role/department/state on every protected operation and status/refresh path. Suspension/department change must affect existing sessions' business authority, not merely the next login or a browser selector.
- Define a restricted initial production-admin provisioning procedure; the current local seed is not production bootstrap. Preserve existing authentication safeguards, session rotation, CSRF, neutral recovery, and secret-safe errors/logs.

### Backend test gate

Unit/contract and migrated PostgreSQL/HTTP tests prove verification alone is insufficient; approval and one department are required; non-admin cannot manage staff; direct URLs/API calls cannot cross departments; ADMIN is authorized; rejection/suspension/department changes affect current authority; concurrent/repeated admin decisions cannot produce inconsistent state. Keep existing verification/reset/refresh/logout/profile/security regressions. Update schema/migration inventory assertions for intentional additions rather than deleting them.

### Frontend integration after the backend gate

Connect existing login/register/verification/recovery pages, account forms, department navigation, staff management/pending dialogs, and status screens. Promote pending/rejected/suspended and unauthorized presentations from demo-only behavior to real state where required; keep OTP/prototype previews separate. Remove local fixture identity/role as authorization. Preserve profile/password/session forms already connected to the API.

### Frontend/browser acceptance and completion

Register → verify → pending → admin approval/department → correct workspace; direct wrong-workspace navigation denied; suspend an already logged-in employee and deny further work; recover/change password and sign out truthfully. Reload and a second browser session read the same persisted account state. P01 is complete only when real staff/status/account routes and their tests pass.

## P02 — Shared customers and persistent incomplete sales drafts

**Outcome:** Sales can manage shared customers and save/reopen their own incomplete drafts across sessions without waiting for the client catalog.

### Backend delivery

- Add stable customer records with name, normalized unique phone, address, optional email, and notes. Implement list/search/create/update/detail, duplicate handling, and the current form's create-and-link return contract.
- Add stable order/draft and individual piece identities, owner ID, known order type, optional customer relation, provisional captured specification fields, notes, and real creation/update timestamps. Distinguish draft validation from final submission validation.
- Support manual save, load, edit, add/duplicate/delete draft piece, and draft listing. Do not require production catalog values, a final business number, all paper fields, or a customer merely to save a draft.
- Use the current typed paper fields and confirmed control kinds as captured draft data. Persist the existing `soleAddition` separately from final free-text `additions`, and retain M1/M2/M3/face as text. Preserve measurement placement and existing agreed validation; final submission uses the received catalog in P03. P02 does not load the workbook or build a form engine.
- Establish the scoped order/customer read contracts and transaction/audit foundation used by later phases. Sales queries use authenticated ownership, including linked orders and measurement history; shared customer access does not widen order access.
- Keep immutable internal draft identity separate from the pending business-number format. A temporary technical reference must not be presented as a client-approved order number.
- Persist and handle concurrent draft/customer edits with visible conflict behavior. A customer-master edit must not mutate a later submitted order snapshot. Do not admit browser-entered prices as authoritative pricing.

### Backend test gate

Cover normalized/concurrent duplicate-phone creation, optional email, no first-customer fallback, customer phone changes retaining stable links, inline link results, draft with missing customer/specifications, add/duplicate/delete identities, reload persistence, two-salesperson isolation, ADMIN access, shared-directory access without order leakage, stale saves, and rejected client authority fields. Use a real disposable database and HTTP boundary.

### Frontend integration after the backend gate

Connect sales/admin customer directory and detail/edit/create screens, inline customer dialog, current create/edit form's draft actions, drafts, and the draft portion of own-order/activity lists. Preserve the current searchable-cell implementation and paper layout. Existing customer order/measurement panels read actual scoped records and gain submitted-order data in P03; they must not fall back to demo orders.

Until P03 catalog loading, quote binding, and remaining submission gates pass, distinguish an unavailable price from zero and prevent real submission with an understandable readiness message in the existing form. Keep the already implemented text/select/read-only controls; do not reconstruct the paper or invent replacement values.

### Frontend/browser acceptance and completion

Create/search/update one shared customer; a second salesperson finds the same customer but cannot open the first salesperson's drafts/orders. Create an incomplete draft, reload/relogin, edit it, and restore its pieces/notes/customer link. Cancel a dialog without writes; display duplicate/conflict/API errors without fake success. P02 can complete with submission explicitly unavailable pending P03.

## P03 — Client-confirmed catalogs, automatic pricing, submission, and sales tracking

**Outcome:** A salesperson submits a complete, correctly priced order using the existing paper form and follows its real state, documents, and activity.

### Backend delivery

- First publish/test the stable submitted-order, piece, customer/price snapshot, totals, and read-model contracts needed downstream. Use the received same-row decoration rates in isolated fixtures. This domain-contract gate permits dependent backend testing; it is not production catalog activation or final submission acceptance.
- Implement the confirmed Section 4 field-to-source matrix. Load the reviewed evaluated workbook values through a scoped, repeatable catalog-loading task during the authorized implementation. Preview/reconcile ranges, family counts, duplicate/invalid entries, and the recorded `زبيري - z` / `تمساح بيبي - CB` source asymmetries. Preserve source codes/labels and do not invent missing values. No new upload/management page, text-field conversion, floor-column construction, or measurement-layout redesign is required.
- Implement deterministic server lookup using selected `decoration` from Z and its same-row AA amount, with all 14 received rates. Other specification fields are not price modifiers. Return the quote to the existing read-only price/total cells, reject salesperson overrides and missing/ambiguous rates, and preserve exact totals and first-submission snapshots. Current read-only rendering is already done; authoritative lookup and binding are the remaining work.
- After NUM-01 confirmation, allocate unique business display numbers transactionally, separately from internal IDs. Test concurrency/reset scope; do not hardcode the current type/year/count examples.
- Implement atomic first submission: validate customer and complete form, calculate/freeze prices and customer contact snapshot, allocate the approved number, record owner/time and activity, and lock sales edits. A failed or repeated request cannot create duplicate orders or partially issued snapshots.
- Implement own-order/dashboard/draft/returned/activity queries, type/status/search/pagination filters, customer order/measurement history, piece tracking, progress, paper projection, and authoritative monetary read models. Later stages populate the same piece/history projections rather than a separate tracking store.
- Allow only the owner salesperson and ADMIN to update cumulative paid amount after approval, with old/new amount, actor/time, and safe exact values. Keep total, paid, remaining due, and surplus owed distinct. No payment gateway, invoices, or financial-reporting expansion.
- Returned-order resubmission is a separate validated command using P04 return decisions; do not silently reprice previously submitted pieces or overwrite historic snapshots/decisions. Changes requiring a new client pricing rule remain an explicit amendment.

### Backend test gate

Unit tests cover every field-policy/decoration-lookup/totals/submission/payment function. Contract and database/HTTP integration verify all 14 same-row Z/AA rates; changing decoration changes an unsubmitted quote; changes to model, size, base, color, floor, or additions do not add price modifiers; cleared/unknown decoration and missing/non-numeric/conflicting rates yield unavailable quotes; and sales cannot override amounts. Import and frontend tests verify exact original-language labels, mixed Arabic/English strings, code spelling/case and leading zeroes through selections/details/corrections/printing, evaluated formula results, all supplied ranges, half-step measurements, distinct `soleAddition`/`additions`, free-text mixing/face fields, grouped L–Y values without count-statistic cells, and preservation of I104. Also cover frozen prices/customer contacts after master updates, atomic/concurrent/retried submission, unique numbers, owner isolation, draft versus submit validation, edit lock, resubmission, paid changes, and surplus. Production acceptance remains open until actual catalog/quote implementation and tests pass and NUM-01 is confirmed.

### Frontend integration after the backend gate

Connect all sales dashboard/order/draft/returned/detail/activity consumers and customer history panels. Bind the received values and decoration quote to existing controls in the current paper and applicable catalog fields in the separate customer-contact correction form. Preserve the already completed free-text M1/M2/M3/face/final additions, middle `soleAddition` column, and read-only amounts. On draft decoration selection, update the automatic backend quote in place; do not add a manual price entry. Display real user/date/number/paid/balance. Preserve piece add/duplicate/remove, type banners, adjustment fields, tabs, tracking, source-specific measurement values, and eight-row print behavior. Persist `soleAddition` through save/reload, correction, read-only and print output. Wire the paid exception without unlocking specifications. P04 owns final approval/return actions and official print eligibility.

### Frontend/browser acceptance and completion

Select/create customer → complete the existing paper with received workbook values → select decoration and obtain its automatic same-row price → submit once → observe the correct queue/state after reload. Verify at least `زبيري - z` 1800, `نعام - O` 1500, and `سادة - S` 650 in isolated/backend acceptance examples, all 14 lookup pairs in automated tests, free-text fields, middle floor addition, correct half-step measurements, owner-only access, immutable snapshots, unavailable-price handling, and persisted/printed fields. Complete one actual catalog-backed submission with the confirmed NUM-01 format before closing P03; a sample-only frontend or fixture quote cannot satisfy that gate.

## P04 — Approval, per-piece decisions, customer-contact reapproval, and official printing

**Outcome:** Approvers decide initial orders and individual manufacturing problems; customer changes cannot bypass approval; approved official paper is available to authorized staff.

### Backend delivery

- Implement initial pending queues, dashboard counts, own decision history, order review/tracking/paper/audit queries, approve, and return-to-sales with mandatory free-text reason and optional additional notes.
- Initial approval releases every active piece to cutting for all seven types and records a single coherent decision/release. Do not retain repair or adjustment shortcuts.
- Implement the issue record/command boundary used by manufacturing: affected piece, source department/state, reporter, reason/notes, time, and unresolved state. Allow only authorized current-department actions; define the report command now so P05 can bind to it.
- Implement the three issue decisions: return to cutting/production with notes; send to owner sales for customer communication; cancel the selected piece with reason/history and recalculated quantities/totals. Unaffected pieces keep their locations, work, and prices.
- Implement sales proposed-change/contact-note/cancellation-request handling and **mandatory piece reapproval**. Preserve previous specification values and first-submission price snapshots. Keep the selected target department and resume work only after approval, never directly from the sales save button.
- Reuse retained cancellation records and exact financial calculation. Cancelled pieces reduce active requirement once; paid stays unchanged and surplus remains visible. Preserve the existing whole-order administrative cancellation eligibility for P08's authorized action.
- Provide order-paper projections and official print eligibility for owner sales, approval, and ADMIN after approval. Factory paper/detail responses omit finance. Prohibit official printing of unapproved/returned revisions; do not generate fake approval seals/signatures.

### Backend test gate

Cover concurrent/repeated approve-versus-return, free-text reasons, all-seven-types cutting release, own decision histories, issue source authorization, each of A/B/C, one affected piece with others continuing, customer-contact amendments awaiting reapproval, salesperson cancellation denied, frozen prices/history, all-pieces-cancelled state, paid/surplus preservation, official-print eligibility, sales ownership, and factory response redaction. Real transactions and HTTP permissions must pass before wiring.

### Frontend integration after the backend gate

Connect approval dashboard/pending/history/detail, return dialog, problem-resolution dialog, and the sales customer-contact queue/modal including its cancellation request. Change the preset return reason into free text and remove direct factory resume/direct cancellation from sales. Bind both existing print aliases to the same authorized projection; preserve the current paper controls and A4 landscape/eight-row print behavior.

### Frontend/browser acceptance and completion

Return an order, correct/resubmit, approve to cutting; exercise issue decisions on one piece; update a customer-contact piece and confirm it is blocked until reapproved. Verify the other pieces continue and counts/money stay correct. Confirm sales/approval/admin print and factory no-finance projections, including 1/8/9/17-row output and cancelled/empty-row handling. Real client-order acceptance still depends on P03 catalog activation, authoritative pricing/submission acceptance, and NUM-01 confirmation.

## P05 — Cutting and production workspaces

**Outcome:** Both manufacturing departments operate the existing order/piece/batch views on the same persisted piece lifecycle.

### Backend delivery

- Implement cutting and production dashboard/count/filter/query contracts for incoming, in-progress, completed/sent, returned, waiting aliases, order detail, task detail, activity, and the production repair-type view.
- Implement receipt/start, continue, partial/group completion and forward-transfer on selected piece IDs. Store actual workers/times; same-department colleagues may continue. Grouping must not invent a separate quantity authority.
- Complete and transfer atomically to the next normal department. Cutting always forwards to production; production forwards to quality. All order types use the same path; a repair-type filter is not permission to skip cutting.
- Bind current-department problem reporting to P04's issue command, retaining report reason/notes and stopping only that piece. Returned/corrected work re-enters the department's ordinary work flow before ordinary completion.
- Implement order/task specification projections without financial fields; preserve source/target/worker/duration/history required by current views.
- Validate batches against persisted state and department, reject stale/duplicate/foreign/ineligible pieces clearly, and prevent double completion/transfer on retry/concurrency.

### Backend test gate

Cover incoming → work → forward for cutting and production, all seven types, colleague continuation, subset completion, simultaneous workers, repeated start/complete/transfer, issue creation and wrong-department denial, returned work, no parallel segment drift, no quantity creation/loss, and no finance in factory responses. Include unit, real database/HTTP integration, and actual selected-piece batch behavior.

### Frontend integration after the backend gate

Connect both workspaces, grouped-order cards, piece tables, batch toolbar, order detail tabs, legacy task detail, department counters/filters, and receipt/start/completion/problem dialogs. Preserve current group/flat views, expansion, selection and navigation. Remove demo worker names, old exclusive-assignee restrictions, repair shortcut wording, and local mutations. Refetch all affected counts/locations/history after success.

### Frontend/browser acceptance and completion

Receive/start selected pieces, continue under a colleague, complete a subset, and see correct next-department incoming data after reload. Report one piece and confirm the rest keep progressing. Re-enter corrected work through the active queue; verify no duplicated movement from double-click/retry. Both departments and their existing task/order routes must pass, not just the dashboard.

## P06 — Quality, packing, rejection, and reinspection

**Outcome:** Quality inspects/accepts/packs pieces or returns them for correction, and hands accepted pieces to warehouse without prematurely counting physical receipt.

### Backend delivery

- Implement quality dashboard, incoming, inspection, accepted, corrections/reinspection, sent/waiting aliases, task/order details, activity, and their real counts/filters.
- Implement receipt/start inspection and per-piece/batch accept or reject. Persist packing fields already captured by the active dialogs/forms rather than dropping callback data.
- Acceptance creates an incoming-to-warehouse handoff; it does not mark warehouse receipt, warehouse completion, or ready-to-dispatch by itself.
- Rejection records target cutting/production, reason, instructions, actual inspector/time, and correction cycle. Resume the normal downstream path and record reinspection after return, including repeated cycles.
- Route manufacturing issues requiring approval through P04's issue path, keeping rejection-to-correction distinct from approval escalation.

### Backend test gate

Cover ordinary pieces with no previous issue, partial/mixed batch outcomes, required rejection data, target authority, repeated correction cycles, cutting → production → quality after rejection, production → quality, accept/pack → warehouse incoming with completed-receipt count unchanged, duplicated inspection commands, and unmodified unaffected pieces.

### Frontend integration after the backend gate

Connect current quality queues, order/piece/batch and task/detail presentations, inspection modal and correction history. Use real actors and persisted packing/inspection notes. Preserve correction/reinspection redirects and existing status presentation; show incoming handoff distinctly from actual warehouse completion.

### Frontend/browser acceptance and completion

Inspect/accept a normal piece, reject another to each allowed department, complete corrections through the normal route, and reinspect. Confirm acceptance is visible in warehouse incoming but does not make the order 100% received. Reload and inspect the full correction history and quantities.

## P07 — Physical warehouse receipt and whole-order delivery

**Outcome:** Warehouse physically receives pieces, reconciles complete orders, and records dispatch, receipt, failure, and retry through existing views.

### Backend delivery

- Implement incoming/in-progress compatibility, incomplete, 100%-ready, out-for-delivery, failed, delivered, dashboard, order details, activity, and their consistent filters/counts.
- Implement explicit physical receipt of accepted incoming pieces. Persist the receipt/packing/carton/location/note fields actually provided by current active controls; do not silently discard them. Repeated receipt must not increase count twice.
- Derive received active count and readiness from authoritative pieces. An incomplete order can have received pieces while others remain in manufacturing; it cannot dispatch. Keep shipped/failed/delivered orders out of the manufacturing-incomplete queue.
- Dispatch an eligible whole order only after every active piece is physically received. Piece selection in this workspace must resolve to explicit whole-order delivery semantics, not silently ship an incomplete order or create partial deliveries.
- Persist courier/handoff details and delivery attempts as supplied by existing dialogs. Warehouse staff confirm complete customer receipt; retain captured recipient/date/notes where present. No courier account is required.
- Record delivery failure only as confirmation the goods returned physically to warehouse; retain reason/notes and the attempt. Retry returns to ready with optional new date, then uses ordinary dispatch again.
- Keep receipt, dispatch, confirm, failure, and retry state-checked and safe under retries/concurrent operators; preserve actual completed manufacturing history.

### Backend test gate

Prove one receipt counted once, partial arrival remains incomplete, cancellation adjusts the active requirement once, 100% means physically received, premature/partial dispatch denied, whole-order dispatch/confirmation, retained dialog fields, delivery failure physically returned, retry with/without date, multiple attempts/history, stale/repeated commands, and paid/snapshot/history preservation. Test all corresponding API authority boundaries.

### Frontend integration after the backend gate

Connect all warehouse queues, grouped/flat/batch views, shared order-detail operations, receipt, dispatch, confirmation, failure, and retry dialogs. Retain the latest distinction between warehouse receipt and manufacturing start/finish; do not restore removed manufacturing actions. Ensure selected-piece UI labels/results accurately express whole-order shipping.

### Frontend/browser acceptance and completion

Receive an order in separate arrivals; see accurate incomplete and ready lists; dispatch only when complete; confirm delivery; exercise physical-return failure and a retry followed by success. Verify notes/cartons/location/recipient fields survive reload where captured, other operators see the changes, and aliases reach the same real order view.

## P08 — Administration, reports, full regression, and production readiness

**Outcome:** All existing admin/report screens use the same operational truth; every accepted workflow is verified across roles and ready for the agreed deployment environment.

### Backend delivery

- Implement admin all-orders/detail/dashboard, customers/details, approval oversight, correction histories, delivery exceptions, immutable activity, and operational report queries using existing domain services and permissions. Reuse P01 staff management and P02 customer services.
- Support current search/status/type/department/exception/date/salesperson filters, pagination and drill-down query parameters. Define each report section's filter scope so cards, tables, department/workforce summaries, print totals, and exceptions agree.
- Implement existing admin cancellation scopes by resolving exact eligible active piece identities and using the same retained cancellation/totals logic. Preserve the current restriction against cancelling dispatched/delivered pieces; avoid arbitrary pieces chosen merely by array order.
- Implement audited administrative reopen/correction for the agreed notes/contact/address allowlist only. A reopen never revives pieces, changes frozen prices/specifications, or rewinds delivery/manufacturing. Paid changes reuse the separate owner-sales/ADMIN command.
- Supply six existing operational report sections: KPI summary, department distribution, workforce, detailed orders, exceptions, and endorsements. Remove fabricated names/dates/document claims; use actual data or honest blank manual-signoff fields. Do not add financial reporting.
- Finish removal of operational localStorage/fixture authority from production routes. Development previews may retain isolated fixtures, but cannot populate a real database, grant permissions, or become an API failure fallback.
- Complete deployment configuration, production-safe initial admin provisioning, HTTPS/same-origin API routing, live mail, migrations, health/readiness, logs, backup/restore procedure, and practical operator/run instructions. Confirm OPS-01 before any target-specific deployment. Existing Compose/Caddy files are starting points, not verified release evidence.

### Backend test gate

Prove filtered aggregate consistency, date boundaries/overdue calculations with real configured time, workforce/count semantics, owner/department redaction, admin cancellation with partial work/overpayment/full cancellation, audited allowed-field corrections and denied forbidden changes, existing-account migration, fresh-database migration, backup restore in a disposable target, and complete domain/API regressions. No false success on inaccessible database/mail/deployment resources.

### Frontend integration after the backend gate

Connect every admin page and existing dialog, both customer perspectives, final cross-role activity/history/metrics, reports and report print. Preserve paper A4 landscape and report A4 portrait, current report filter URLs, menus, pagination, and layout. Official print data/permissions match the screen projection. Keep OTP/prototype previews development-only; keep real status/unauthorized/error pages usable.

### Final acceptance and completion

- Full browser flows: employee approval; shared customers/own-sales orders; incomplete draft; approved real pricing/submission; return/correction/resubmission; all seven types through cutting and production; colleague continuation; single-piece issue decisions and sales reapproval; quality correction; physical receipt; whole-order delivery; failure/retry; cancellation/overpayment; administrative correction; authorized print/report.
- Test direct unauthorized HTTP/URL access, two users/tabs, stale edits, duplicate actions/retries, API/database/mail failures, and correct error recovery. Use a real disposable/staging backend rather than intercepted mock success for the main end-to-end path.
- Received CAT-01/CAT-02 mappings/values and PRC-01 rates are implemented, loaded, and verified; NUM-01 and required actual submission examples are resolved. All Appendix A routes and Appendix B active actions have evidence. No production request uses sample catalog/price/clock/persona/fixture data.
- Run full verification/build and focused print/RTL/responsive checks. Confirm production mail receipt, restart persistence, and backup restoration. Actual production deployment requires explicit authorization and separate observed results; local acceptance alone is not a deployed release.
- Update the project README/reference for the implemented product and real commands. P08 is incomplete if any phase, client input, required test, or release dependency remains open.

## 7. Test strategy and evidence

Each phase creates or extends actual test files. For each business function, cover its valid transition/calculation, invalid input/state, permissions, and meaningful edge conditions. Real database/HTTP tests cover persistence, migration constraints, rollback, concurrency, retries, and projections; frontend integration covers commands/errors/refetch; browser tests cover the reached user journey. Avoid tests that merely mirror rendering or return constants.

Preserve existing API/auth/contracts/database regression suites. Several baseline database tests assert the current exact schema inventory; update them intentionally when adding domain tables/statuses rather than removing the assertions. API and database integration must use disposable databases, never the user's current development/production data.

Establish browser end-to-end support during P01 and extend it phase by phase using the same existing routes. Do not document a browser test command as present before it has been added and verified. Use reviewed source-derived fixtures only in isolated tests/development while verifying the real loading/quote path. Received workbook values are not evidence that production catalog loading, authoritative pricing, or business-number acceptance has passed.

Existing commands verified from package scripts, **not run as application checks while writing this plan**:

```text
pnpm --filter @template/contracts test
pnpm --filter @template/database test
pnpm --filter @template/database test:integration
pnpm --filter @template/api test
pnpm --filter @template/api test:integration
pnpm --filter @template/web test
pnpm lint
pnpm check-types
pnpm build
pnpm verify:build-output
pnpm format:check
git diff --check
```

Use affected-package tests and relevant shared regressions after a task batch. Run broader regression at domain handoffs and full verification before release. Root `pnpm verify` already exists but formats/generates Prisma artifacts before checking/building; it is an implementation/release command, not a purely read-only review command. Turbo test tasks can build dependencies. Do not run root formatting just to format this one document.

Keep phase evidence short: actual command/result, scenario/role, persisted outcome, and unresolved limit. A unit test, rendered screen, provider response, or readiness endpoint does not by itself prove the whole workflow.

## Appendix A. Complete current route ownership

The table below inventories every current `page.tsx` definition. Paths are URL patterns; source route groups do not appear in URLs. A primary phase owns the screen's integration; shared identity comes from P01 and later domain data may enrich the same existing view. Preserve redirects and both print aliases. No route is implicitly dropped because its current implementation uses demo state.

| Current route                   | Kind     | Primary delivery | Integration note                                                                         |
| ------------------------------- | -------- | ---------------- | ---------------------------------------------------------------------------------------- |
| `/orders/[orderId]/print`       | Screen   | P04              | Same official-order projection; A4 landscape; authorized sales/approval/ADMIN.           |
| `/print/order/[orderId]`        | Screen   | P04              | Same official-order projection; A4 landscape; authorized sales/approval/ADMIN.           |
| `/reports/print`                | Screen   | P08              | Six operational sections; A4 portrait; ADMIN report authority.                           |
| `/admin/account`                | Screen   | P01              | Shared real profile/password/session forms.                                              |
| `/admin/activity`               | Screen   | P08              | Use the owning domain contracts and existing presentation.                               |
| `/admin/approvals`              | Screen   | P08              | Use the owning domain contracts and existing presentation.                               |
| `/admin/corrections`            | Screen   | P08              | Use the owning domain contracts and existing presentation.                               |
| `/admin/customers/[phone]`      | Screen   | P02              | Customer master P02; scoped submitted-order history P03.                                 |
| `/admin/customers`              | Screen   | P02              | Customer master P02; scoped submitted-order history P03.                                 |
| `/admin/dashboard`              | Screen   | P08              | Use the owning domain contracts and existing presentation.                               |
| `/admin/delivery-exceptions`    | Screen   | P08              | Use the owning domain contracts and existing presentation.                               |
| `/admin/orders/[orderId]`       | Screen   | P08              | Use the owning domain contracts and existing presentation.                               |
| `/admin/orders`                 | Screen   | P08              | Use the owning domain contracts and existing presentation.                               |
| `/admin`                        | Redirect | P08              | Redirect to `/admin/dashboard`.                                                          |
| `/admin/registration-requests`  | Redirect | P01              | Redirect to `/admin/users/pending`.                                                      |
| `/admin/reports`                | Screen   | P08              | Use the owning domain contracts and existing presentation.                               |
| `/admin/users`                  | Screen   | P01              | Use the owning domain contracts and existing presentation.                               |
| `/admin/users/pending`          | Screen   | P01              | Use the owning domain contracts and existing presentation.                               |
| `/approval/account`             | Screen   | P01              | Shared real profile/password/session forms.                                              |
| `/approval/dashboard`           | Screen   | P04              | Use the owning domain contracts and existing presentation.                               |
| `/approval/history`             | Screen   | P04              | Use the owning domain contracts and existing presentation.                               |
| `/approval/orders/[orderId]`    | Screen   | P04              | Use the owning domain contracts and existing presentation.                               |
| `/approval`                     | Redirect | P04              | Redirect to `/approval/dashboard`.                                                       |
| `/approval/pending`             | Screen   | P04              | Use the owning domain contracts and existing presentation.                               |
| `/cutting/account`              | Screen   | P01              | Shared real profile/password/session forms.                                              |
| `/cutting/activity`             | Screen   | P05              | Use the owning domain contracts and existing presentation.                               |
| `/cutting/completed`            | Screen   | P05              | Use the owning domain contracts and existing presentation.                               |
| `/cutting/dashboard`            | Screen   | P05              | Use the owning domain contracts and existing presentation.                               |
| `/cutting/in-progress`          | Screen   | P05              | Use the owning domain contracts and existing presentation.                               |
| `/cutting/incoming`             | Screen   | P05              | Use the owning domain contracts and existing presentation.                               |
| `/cutting/orders/[orderId]`     | Screen   | P05              | Use the owning domain contracts and existing presentation.                               |
| `/cutting`                      | Redirect | P05              | Redirect to `/cutting/dashboard`.                                                        |
| `/cutting/returned`             | Screen   | P05              | Use the owning domain contracts and existing presentation.                               |
| `/cutting/sent`                 | Redirect | P05              | Redirect to `/cutting/completed`.                                                        |
| `/cutting/tasks/[orderId]`      | Screen   | P05              | Use the owning domain contracts and existing presentation.                               |
| `/cutting/waiting`              | Redirect | P05              | Redirect to `/cutting/incoming`.                                                         |
| `/production/account`           | Screen   | P01              | Shared real profile/password/session forms.                                              |
| `/production/activity`          | Screen   | P05              | Use the owning domain contracts and existing presentation.                               |
| `/production/completed`         | Screen   | P05              | Use the owning domain contracts and existing presentation.                               |
| `/production/dashboard`         | Screen   | P05              | Use the owning domain contracts and existing presentation.                               |
| `/production/in-progress`       | Screen   | P05              | Use the owning domain contracts and existing presentation.                               |
| `/production/incoming`          | Screen   | P05              | Use the owning domain contracts and existing presentation.                               |
| `/production/orders/[orderId]`  | Screen   | P05              | Use the owning domain contracts and existing presentation.                               |
| `/production`                   | Redirect | P05              | Redirect to `/production/dashboard`.                                                     |
| `/production/repairs`           | Screen   | P05              | Repair-type view; same full manufacturing path as every type.                            |
| `/production/returned`          | Screen   | P05              | Use the owning domain contracts and existing presentation.                               |
| `/production/sent`              | Redirect | P05              | Redirect to `/production/completed`.                                                     |
| `/production/tasks/[orderId]`   | Screen   | P05              | Use the owning domain contracts and existing presentation.                               |
| `/production/waiting`           | Redirect | P05              | Redirect to `/production/incoming`.                                                      |
| `/quality/accepted`             | Screen   | P06              | Use the owning domain contracts and existing presentation.                               |
| `/quality/account`              | Screen   | P01              | Shared real profile/password/session forms.                                              |
| `/quality/activity`             | Screen   | P06              | Use the owning domain contracts and existing presentation.                               |
| `/quality/corrections`          | Screen   | P06              | Use the owning domain contracts and existing presentation.                               |
| `/quality/dashboard`            | Screen   | P06              | Use the owning domain contracts and existing presentation.                               |
| `/quality/incoming`             | Screen   | P06              | Use the owning domain contracts and existing presentation.                               |
| `/quality/inspection`           | Screen   | P06              | Use the owning domain contracts and existing presentation.                               |
| `/quality/orders/[orderId]`     | Screen   | P06              | Use the owning domain contracts and existing presentation.                               |
| `/quality`                      | Redirect | P06              | Redirect to `/quality/dashboard`.                                                        |
| `/quality/reinspection`         | Redirect | P06              | Redirect to `/quality/corrections`.                                                      |
| `/quality/sent`                 | Redirect | P06              | Redirect to `/quality/accepted`.                                                         |
| `/quality/tasks/[orderId]`      | Screen   | P06              | Use the owning domain contracts and existing presentation.                               |
| `/quality/waiting`              | Redirect | P06              | Redirect to `/quality/incoming`.                                                         |
| `/sales/account`                | Screen   | P01              | Shared real profile/password/session forms.                                              |
| `/sales/activity`               | Screen   | P03              | Draft read data may connect in P02; no fixture fallback.                                 |
| `/sales/customers/[phone]/edit` | Screen   | P02              | Customer master P02; scoped order/measurement history P03.                               |
| `/sales/customers/[phone]`      | Screen   | P02              | Customer master P02; scoped order/measurement history P03.                               |
| `/sales/customers/new`          | Screen   | P02              | Customer master P02; scoped order/measurement history P03.                               |
| `/sales/customers`              | Screen   | P02              | Customer master P02; scoped order/measurement history P03.                               |
| `/sales/dashboard`              | Screen   | P03              | Draft read data may connect in P02; no fixture fallback.                                 |
| `/sales/orders/[orderId]/edit`  | Screen   | P02 / P03        | Incomplete draft P02; confirmed policy/pricing/submission P03.                           |
| `/sales/orders/[orderId]`       | Screen   | P03              | Draft read data may connect in P02; no fixture fallback.                                 |
| `/sales/orders/drafts`          | Screen   | P02 / P03        | Incomplete draft P02; confirmed policy/pricing/submission P03.                           |
| `/sales/orders/new`             | Screen   | P02 / P03        | Incomplete draft P02; confirmed policy/pricing/submission P03.                           |
| `/sales/orders`                 | Screen   | P03              | Draft read data may connect in P02; no fixture fallback.                                 |
| `/sales/orders/returned`        | Screen   | P03 / P04        | Sales resubmission P03; approval return/reapproval P04.                                  |
| `/sales`                        | Redirect | P03              | Redirect to `/sales/dashboard`. Draft read data may connect in P02; no fixture fallback. |
| `/warehouse/account`            | Screen   | P01              | Shared real profile/password/session forms.                                              |
| `/warehouse/activity`           | Screen   | P07              | Use the owning domain contracts and existing presentation.                               |
| `/warehouse/dashboard`          | Screen   | P07              | Use the owning domain contracts and existing presentation.                               |
| `/warehouse/delivered`          | Screen   | P07              | Use the owning domain contracts and existing presentation.                               |
| `/warehouse/delivery-failed`    | Screen   | P07              | Use the owning domain contracts and existing presentation.                               |
| `/warehouse/in-progress`        | Screen   | P07              | Compatibility screen renders the ready queue; preserve existing URL.                     |
| `/warehouse/incoming`           | Screen   | P07              | Use the owning domain contracts and existing presentation.                               |
| `/warehouse/incomplete`         | Screen   | P07              | Use the owning domain contracts and existing presentation.                               |
| `/warehouse/orders/[orderId]`   | Screen   | P07              | Use the owning domain contracts and existing presentation.                               |
| `/warehouse/out-for-delivery`   | Screen   | P07              | Use the owning domain contracts and existing presentation.                               |
| `/warehouse`                    | Redirect | P07              | Redirect to `/warehouse/dashboard`.                                                      |
| `/warehouse/ready`              | Screen   | P07              | Use the owning domain contracts and existing presentation.                               |
| `/warehouse/tasks/[orderId]`    | Redirect | P07              | Redirect to `/warehouse/orders/[orderId]`.                                               |
| `/auth/forgot-password`         | Screen   | P01              | Use the owning domain contracts and existing presentation.                               |
| `/auth/login`                   | Screen   | P01              | Use the owning domain contracts and existing presentation.                               |
| `/auth/otp`                     | Redirect | Development only | Redirect to `/auth/verify-otp`. Keep demo-only; no production OTP feature.               |
| `/auth/pending-approval`        | Screen   | P01              | Connect real account/access state; currently demo-gated.                                 |
| `/auth/register`                | Screen   | P01              | Use the owning domain contracts and existing presentation.                               |
| `/auth/rejected`                | Screen   | P01              | Connect real account/access state; currently demo-gated.                                 |
| `/auth/reset-password`          | Screen   | P01              | Use the owning domain contracts and existing presentation.                               |
| `/auth/suspended`               | Screen   | P01              | Connect real account/access state; currently demo-gated.                                 |
| `/auth/verify-email`            | Screen   | P01              | Use the owning domain contracts and existing presentation.                               |
| `/auth/verify-otp`              | Screen   | Development only | Keep demo-only; no production OTP feature.                                               |
| `/`                             | Redirect | P01              | Redirect to `/auth/login`.                                                               |
| `/prototype-preview`            | Screen   | Development only | Retain isolated previews; verify production gating in P08.                               |
| `/unauthorized`                 | Screen   | P01              | Connect real account/access state; currently demo-gated.                                 |

## Appendix B. Active dialogs and small interaction coverage

| Existing surface/component                                                                                            | Phase             | Required persisted behavior or explicit classification                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staff approve/reject/manage and department/status controls in `admin-users-view.tsx`                                  | P01               | Real administrator decisions, single department, active/rejected/suspended state, actual actor/time                                                                               |
| `admin-assign-role-dialog.tsx`                                                                                        | P01               | Reuse or reconcile with the active staff-control path; do not leave a reachable mock alternate or invent a new management page                                                    |
| Profile, password, logout and logout-all forms                                                                        | P01               | Preserve real account API behavior; no fixture password or false logout success                                                                                                   |
| `inline-customer-modal.tsx` and customer create/edit forms                                                            | P02               | Saved shared customer, normalized uniqueness, correct saved record linked to current draft, cancel without writes                                                                 |
| Paper cells, searchable portal menu, size table, adjustment fields, notes/signature, floor/options and money controls | P02/P03           | Preserve completed controls; persist distinct floor `soleAddition` and text `additions`; bind received workbook values and decoration-only backend prices; read-only/print parity |
| Add, duplicate, remove piece; save draft; submit/resubmit                                                             | P02/P03           | Stable piece IDs, incomplete draft support, server-authoritative submitted snapshots/lock, no duplicate submit                                                                    |
| `approval-return-modal.tsx`                                                                                           | P04               | Mandatory free-text reason and retained review notes; no preset-only reason requirement                                                                                           |
| `approval-problem-resolution-modal.tsx`                                                                               | P04               | A/B/C on one piece, target department, notes and cancellation confirmation; unaffected pieces continue                                                                            |
| `sales-problem-contact-modal.tsx`, including its nested cancellation confirmation                                     | P04               | Contact notes/proposed changes → reapproval; cancellation request only; bind confirmed field options, preserve prior values                                                       |
| `receive-and-start-dialog.tsx`, `confirm-receipt-dialog.tsx`, `start-work-dialog.tsx`                                 | P05/P06           | Current-department receipt/work transitions and actual employee identity; align overlapping reached entry points                                                                  |
| `record-completion-dialog.tsx` and piece/batch completion controls                                                    | P05               | Exact selected pieces, completion and forward transfer together, partial work without lost quantities                                                                             |
| `piece-report-problem-modal.tsx`                                                                                      | P05/P06           | Reason/notes and exact affected piece(s) sent to approval, no order-wide stoppage                                                                                                 |
| `quality-inspect-piece-modal.tsx`, `quality-inspection-dialog.tsx`                                                    | P06               | Accept/packing/incoming handoff or reject/target/instructions/correction cycle; no receipt count on QC acceptance                                                                 |
| `confirm-warehouse-receipt-dialog.tsx` and shared warehouse receipt operations                                        | P07               | Physical receipt once, actual captured cartons/location/notes persisted where supplied                                                                                            |
| `dispatch-delivery-dialog.tsx` and whole-order batch dispatch                                                         | P07               | Complete active order only, actual courier/handoff details, no partial shipment hidden behind piece selection                                                                     |
| `confirm-delivery-dialog.tsx`                                                                                         | P07               | Whole-order customer receipt and actual captured recipient/date/notes                                                                                                             |
| `delivery-failed-dialog.tsx`, `record-delivery-failed-dialog.tsx`                                                     | P07               | Physical-return acknowledgement, reason/notes/attempt; align reached alternate paths                                                                                              |
| `retry-delivery-dialog.tsx` and warehouse retry operations                                                            | P07               | Ready-for-dispatch again, optional new date, preserved prior attempts                                                                                                             |
| `admin-cancel-dialog.tsx` and `cancellation-scope.tsx`                                                                | P08               | Resolve exact eligible pieces, shared cancellation logic, retained reason/history and paid/surplus evidence                                                                       |
| `admin-reopen-dialog.tsx` and admin correction controls                                                               | P08               | Agreed field allowlist and audit, no production rewind or price/spec edit                                                                                                         |
| Report filters/print preview, pagination, group/flat tabs, expand/select-all, tracking/history tabs                   | Owning domain/P08 | Real scoped queries and shared counts, consistent mutation results, preserved presentation                                                                                        |
| Toasts and success/error confirmations                                                                                | Every phase       | Success only after confirmed command; failures remain visible/retryable, cancel causes no write                                                                                   |
| OTP input and role/reset/demo controls in prototype preview                                                           | Development only  | No real OTP rollout, production permission bypass, or production fixture/reset endpoint                                                                                           |

Names in this appendix refer to existing files under `apps/web/src/features` unless a shared account form is indicated. Inventorying a legacy component does not require connecting an unreachable duplicate; record its actual callers and consolidate onto an existing accepted path when needed. Removal of a product page or a new user workflow requires an explicit scope amendment.

## Appendix C. Definition of project completion

The project is complete only when all eight phases have passed backend and frontend gates, the received workbook mapping/values and decoration-only rates have been loaded and verified, remaining numbering/release dependencies are resolved, every retained operational screen/action has a real authorized data source, repeat/concurrent requests preserve quantities/money/history, printing and access rules match the agreed roles, and the agreed target environment has observed release/mail/backup/restore evidence. Completed paper controls, data receipt, preview availability, and local fixture behavior do not substitute for actual backend/integration acceptance.
