<!--
Sync Impact Report
- Version: unratified scaffold -> 1.0.0 (initial Oriental Shoes adoption, 2026-11-03).
- Adopted the same eleven engineering principles and limited-model handoff standard
  as the next-express-boilerplate constitution 1.1.0, with local project references.
- Added guide ownership, stage-specific delivery/readiness gates and governance.
- Preserved the existing roadmap, product decisions and frontend; no phase approved.
- Separately authorized follow-up completed: engineering/workflow guides, agent
  routes, project template overrides and client command adapters adapted to this
  checkout while preserving its existing CLI settings and core provenance.
- No application implementation, runtime changes, release or model guarantee.
- Deferred placeholders: none.
-->

# Oriental Shoes Constitution

## Core Principles

### I. Explicit Intent, Bounded Phases and Current Evidence

Accepted requirements MUST define intended behavior. Source, manifests, configuration,
migrations and fresh checks MUST establish what currently exists. Conflicts MUST be
reported and resolved against the accepted intent; examples and historical behavior
MUST NOT silently become product requirements.

The root `plan.md` MUST own the project roadmap, stable phase IDs, dependencies and
exit criteria. Each selected delivery phase MUST map to one Spec Kit feature under
`specs/`; its implementation `plan.md` is a separate document. Agents MUST verify
that mapping and the active feature before downstream commands. Work MUST remain
within the authorized command, phase and task scope, preserve unrelated edits and
reuse completed foundations. Explicit authorization for a sequence or a whole phase
MAY cover its necessary steps; routine batch boundaries do not require renewed approval.

Rationale: a repeatable workflow needs an unambiguous target and evidence of reality.

### II. One Architecture and Clear Responsibility Owners

The existing apps/packages workspace, package boundaries and supported toolchain MUST
be extended consistently. Thin routes/controllers adapt HTTP; cohesive services own
use cases, authorization close to data and transaction sequencing. Composition creates
dependencies; infrastructure adapters own provider mechanics. Database implementation
MUST remain server-owned. Web pages compose features; feature API modules use the
central transport, hooks own server-state lifecycle, models own pure/form rules and
components own presentation and transient interaction.

New modules MUST follow the canonical recipes in the engineering guides. Exceptions
MUST state a concrete constraint and preserve dependency direction. Query, mapper,
rule and type extraction MUST follow meaningful responsibility or reuse; empty layers
and competing patterns MUST NOT be introduced merely to match a diagram.

Rationale: one understandable pattern makes changes inspectable across features.

### III. Maintainable, Strict and Efficient Code

Clean Code, SOLID, DRY, KISS and YAGNI MUST be applied through clear names, cohesive
functions, explicit dependencies and focused modules. Shared code MUST represent
shared meaning. Existing owners MUST be preferred over duplicate helpers or global
utility collections. TypeScript strictness, exact optional semantics, lint and format
checks MUST remain enabled. Errors MUST be narrowed and handled deliberately; broad
`any`, suppression directives, fake double casts and weakened assertions MUST NOT
conceal defects.

Agents MUST justify new dependencies and abstractions against the current feature.
Queries, payloads and expensive work MUST be bounded; N+1 access, unnecessary client
bundles, duplicate requests and unbounded concurrency MUST be assessed where relevant.
Optimization MUST address an observed or specified cost with evidence; speculative
caching, framework replacement and arbitrary file-size or coverage quotas are excluded.

Rationale: scalable code starts with visible ownership and bounded work, not added layers.

### IV. One Executable Contract Across the HTTP Boundary

`@template/contracts` MUST own browser-safe Zod schemas and inferred wire types shared
by API and web. API DTOs MUST reuse those schemas. Request validation, explicit safe
output projections, HTTP responses, OpenAPI, feature adapters and tests MUST agree on
method, path, status, fields, error codes and pagination semantics. Untrusted input
and server responses consumed by the browser MUST be runtime-validated at their
documented boundaries. Prisma records and provider objects MUST NOT become public DTOs.

Contract changes MUST update producer and consumers together and state compatibility
and rollout implications when independently deployed consumers can be affected.

Rationale: compile-time agreement alone does not validate data crossing a boundary.

### V. Server Authority and Secure Defaults

The API MUST enforce authenticated identity, current account state, required roles,
resource ownership and allowed transitions. Browser guards and hidden controls MUST
only affect presentation. Authorization MUST be rechecked at the protected write when
concurrent state changes can invalidate it. Inputs, uploads and provider replies MUST
be treated as untrusted and bounded. Public output MUST use deliberate allowlists.

Existing password, token, session, cookie, CSRF, CORS, rate-limit, safe redirect,
safe-error, request-ID and log-redaction protections MUST be preserved when extended.
Server secrets and persistent credentials MUST remain in validated server configuration
and outside source control, browser bundles, URLs, logs, real-data fixtures and ordinary
diagnostics. Purpose-bound one-time verification/recovery links MAY carry their action
credential only within the approved flow, with redaction and retention controls from
the security guide. Production settings MUST fail closed. Security claims MUST state actual limitations and evidence; no
document, model choice or green suite guarantees absence of vulnerabilities.

Rationale: authority and privacy belong at the server and data boundaries.

### VI. Persistent Integrity, Concurrency and Safe Change

PostgreSQL constraints, keys, indexes, conditional writes and correctly scoped Prisma
transactions MUST enforce real data invariants. Application prechecks alone MUST NOT
be used as race protection. Features MUST define applicable duplicate, idempotency,
retry, stale-write, rollback, history and external-side-effect semantics. Transactions
MUST remain short; external network work MUST stay outside database transactions.

Schema changes MUST use forward migrations with an existing-data strategy and
proportionate recovery reasoning. Applied migration history and generated Prisma code
MUST remain intact. Tests MUST use isolated data/infrastructure. Destructive database
operations, production migration/deployment and real spending require authorization
covering that action and environment; missing infrastructure MUST NOT trigger a
fallback to unrelated developer or production data.

Rationale: integrity must survive races, failures and upgrades, not just happy paths.

### VII. Backend Acceptance Before Dependent Frontend Integration

Before connecting a feature's frontend to new behavior, its required backend group
MUST be implemented, reviewed and tested: applicable shared contracts, migrations,
constraints, authorization, services, queries/mappers, endpoints, provider boundaries
and failure handling. A partial service, fixture response or mocked success MUST NOT
meet that gate. One selected feature MAY contain ordered backend and frontend groups;
unrelated backend work does not depend on a UI decision.

Rationale: the interface must consume verified authoritative behavior.

### VIII. Preserved Design and Truthful Frontend State

Existing approved design, routes, navigation and interaction patterns MUST be
preserved. Necessary functional changes MUST stay within accepted scope and reuse
existing components and tokens. Redesign or new product surfaces require a request
covering them; a genuinely missing required surface MUST become an explicit decision,
not an invented screen or a silently discarded requirement.

TanStack React Query MUST own server state through the existing QueryClient;
React Hook Form MUST own form drafts and local React state transient interaction.
Features MUST define applicable loading, empty, error, retry, pending, success,
conflict, denied and stale states. Cache keys, invalidation, account changes, dirty
drafts, duplicate submission and late responses MUST be handled deliberately.
Optimistic state MUST NOT be represented as confirmed persistence. Accessibility,
responsive behavior and the project's accepted language/direction MUST be verified
where affected. Framework-dependent changes MUST consult installed Next.js guidance.

Rationale: functional integration preserves the product while communicating truth.

### IX. Meaningful Automated Tests and Honest Completion

Every behavior-changing implementation phase MUST create or extend actual discovered
automated test files. Coverage MUST follow requirements and risks: applicable success,
failure, validation, authorization, boundary, regression and concurrency cases.
Persistence/constraint/rollback claims MUST use real migrated PostgreSQL; HTTP claims
the actual Express stack; frontend state claims real component/hook interaction; and
browser-only claims a real browser. Mocks MUST remain outside the boundary being proved.
Documentation-only changes MUST use documentation checks rather than ceremonial tests.

Agents MUST run focused checks and affected shared regressions for each bounded batch,
then full applicable verification at phase exit and before release. Assertions MUST
remain meaningful; skipped tests, arbitrary sleeps/retries, suppression and fabricated
results MUST NOT hide failures. Reports MUST separate fresh execution, matching reused
or cached evidence, failed checks and unperformed work. Required missing evidence
leaves the corresponding acceptance gate incomplete.

Rationale: test-file count and a successful formatter do not prove accepted behavior.

### X. The Same Standards Govern Authoring and Review

Before Spec Kit planning, tasks, implementation or review, agents MUST read the
engineering index and the guides mapped to every affected boundary. At phase intake
they MUST read the full core guide set; bounded follow-up batches revisit the relevant
sections and source. Code MUST be reviewed against the same ownership, style, contract,
security, data and verification rules used to write it. Requirements conformity and
engineering conformity MUST have separate verdicts; passing tests waive neither.

Applicable installed skills SHOULD assist review. The checked-in guides MUST remain
self-contained: a missing optional skill MUST be reported and its review performed
directly from the guides, without installing tools or claiming skill use. Findings
MUST cite concrete evidence and the smallest adequate correction. Required in-scope
findings MUST be resolved before acceptance; unrelated work remains separately scoped.

Rationale: explicit review criteria make quality repeatable across model capabilities.

### XI. Implementation-Ready Handoffs for a Limited Model

All generated phase artifacts MUST assume implementation by a model with limited
reasoning and context. The specification MUST define complete observable behavior,
inputs, outcomes, authority and failure cases. The technical plan and task briefs
MUST translate that intent into explicit file owners, reused/proposed interfaces,
ordered steps, applicable data/HTTP/UI/cache decisions, preserved invariants and
concrete verification cases. Material design choices MUST be resolved from accepted
requirements and verified repository patterns before dependent implementation.

Each implementation task MUST carry or precisely reference a bounded execution brief
in the existing feature artifacts, including the source/guide sections to read and
the evidence required for completion. Generic phrases such as "follow best practice"
or "handle errors" MUST NOT substitute for the relevant decisions. Use capability-
specific detail and justified N/A rather than filling unused architecture sections.

ANALYZE MUST assess handoff completeness; IMPLEMENT MUST check the selected briefs
against current source before implementation code changes. Missing material decisions, stale interface
assumptions or contradictions block dependent work until resolved through the owning
authorized planning step. Routine coding choices remain possible within fixed
behavior and architecture; the implementer MUST NOT invent those contracts to bypass
a missing design. `docs/workflow/implementation-handoff.md` owns this readiness gate.

Rationale: detailed, bounded instructions reduce reliance on the implementer's ability
to infer architecture, hidden requirements or failure semantics.

## Engineering Guide Obligations

These guides are normative implementation references, with one detailed owner per topic:

| Guide                                   | Owns                                                                |
| --------------------------------------- | ------------------------------------------------------------------- |
| `docs/engineering/README.md`            | Intake, repository map, placement and reading routes                |
| `docs/engineering/code-style.md`        | Naming, types, responsibility, module patterns and efficiency       |
| `docs/engineering/backend-standard.md`  | Express module recipe, composition and use-case lifecycle           |
| `docs/engineering/frontend-standard.md` | Next/React features, forms, QueryClient/cache and UI state          |
| `docs/engineering/api-contracts.md`     | Executable wire schemas, validation, HTTP and compatibility         |
| `docs/engineering/data-patterns.md`     | Prisma/PostgreSQL, queries, constraints, transactions and migration |
| `docs/engineering/security.md`          | Identity, authorization, credentials and untrusted boundaries       |
| `docs/engineering/testing.md`           | Discovered tests, evidence selection, commands and cleanup          |
| `docs/engineering/code-review.md`       | Review coverage, findings and acceptance verdicts                   |

`docs/workflow/phase-delivery.md` owns the roadmap-to-feature workflow and command
boundaries. `docs/workflow/implementation-handoff.md` owns artifact detail, task briefs
and readiness checks for the limited implementation model.
`docs/workflow/prompts.md` supplies reusable launchers. Root `AGENTS.md`
routes agents to these owners. `docs/engineering/integration-walkthrough.md` traces
the existing profile flow through those owners and labels current limitations.
Examples teach existing seams or explicitly proposed
patterns; they do not authorize features. Detailed rules MUST be linked instead of
copied between guides. Historical records MUST be labelled and verified before reuse.

The manifests, lockfile and installed framework documentation own actual versions
and APIs. Preserve the Next.js/Express/Prisma/PostgreSQL workspace and existing
authentication foundation. This constitution establishes a target standard; its
adoption does not certify every pre-existing line or authorize blanket refactoring.

Oriental Shoes already has a root `plan.md` and an existing Arabic/RTL operational
frontend. Preserve that roadmap and approved presentation. Its recorded draft,
owner-review and client-input gates remain explicit; adoption of this constitution
does not approve a phase or authorize application implementation. Existing real
authentication/account behavior and browser-local operational fixtures MUST be
distinguished. The historical `docs/FRONTEND_MIGRATION_AUDIT.md` is dated evidence,
not a competing source of current business rules or permission to redesign.

## Delivery Workflow and Quality Gates

Each feature plan MUST record `PASS`, a capability-specific `N/A`, or an unresolved
blocking issue for these checks before research and again after design:

1. **Scope:** root roadmap phase, active feature, dependencies, existing behavior,
   exclusions, preserved edits, deliverables and observable exit criteria.
2. **Ownership:** actual files and dependency direction, existing foundations reused,
   canonical backend/frontend pattern and justified deviations/dependencies.
3. **Contracts and authority:** shared schemas, exact HTTP behavior, actors, current
   authorization, safe outputs, validation and credential boundaries.
4. **Data and efficiency:** invariants, query bounds/indexes, migration/existing-data
   handling, races/retries/side effects and recovery where applicable.
5. **Delivery order and UI:** backend acceptance before dependent integration, approved
   surfaces, async/cache/draft states, accessibility and framework guidance.
6. **Verification and review:** real test-file tasks, required infrastructure, focused
   and phase-exit commands, both review dimensions and remaining evidence limits.
7. **Implementation readiness:** operation-specific design, current source/interface
   agreement, concrete success/failure assertions and planned task-brief production
   at PLAN; completed bounded briefs after TASKS and before dependent code edits.
   Evaluate the artifacts due at the current stage. Unresolved material decisions
   MUST NOT be delegated to the implementation model.

Before research, assess the authorized scope, viable design/research approach and
coverage of unresolved technical facts. After design, assess the filled operation
blueprints and planned brief production. A missing later-stage artifact MUST NOT
block its own authorized producing step; later implementation still requires it.

Tasks MUST identify concrete file owners, dependencies and verifiable outcomes.
Implementation MUST resolve the authorized task scope and execute dependency-safe
batches. Requirements-quality approval MUST remain distinct from execution evidence.
`ANALYZE` is read-only; `CONVERGE` only appends traceable remaining tasks to the selected
task list. A command's suggested next action MUST NOT itself authorize execution.
Phase completion MUST be distinguished from a batch, backend group and release.

## Governance

Authority order is explicit current user decisions; this constitution; accepted
roadmap/feature requirements; owning engineering and workflow guides; generated
artifacts and historical examples. Source/configuration and fresh checks are evidence
of current behavior, not permission to override accepted intent. Conflicts MUST be
reported with their affected requirement, rule and necessary decision.

Amendments MUST be explicitly authorized, explain rationale and compatibility or
migration impact, update version/date and synchronize affected references and
project-owned Spec Kit overrides. Use MAJOR for incompatible principle changes,
MINOR for added or materially expanded obligations and PATCH for nonsemantic fixes.
Keep ratification date unchanged after initial adoption. The constitution command
owns this file; separately authorized documentation/template work follows in its
own step. Review all changed references before claiming governance completion.

Commit/push, deployment and destructive/external actions MUST stay within the user's
actual authorization. Local checks do not authorize release. Unresolved mandatory
violations block affected acceptance; a justification table cannot silently waive
a principle. Reports MUST state actual changes, checks, warnings and remaining gaps.

**Version**: 1.0.0 | **Ratified**: 2026-11-03 | **Last Amended**: 2026-11-03
