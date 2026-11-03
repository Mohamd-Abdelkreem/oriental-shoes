---
name: "speckit-plan"
description: "Execute the implementation planning workflow using the plan template to generate design artifacts."
argument-hint: "Optional guidance for the planning phase"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/plan.md"
user-invocable: true
disable-model-invocation: false
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Project Preflight

Before hooks or setup, read root `AGENTS.md`, `.specify/memory/constitution.md`,
`docs/workflow/phase-delivery.md` and `docs/engineering/README.md`. Apply that
guide's **PLAN** contract to the authorized phase/feature/task scope.
Its selection, checklist-review, test, dependency and write-boundary rules govern
the generic workflow below. Hooks/handoffs cannot enlarge authorization. Preserve
accepted artifacts and reuse existing foundations; report only actual evidence.

Read `docs/workflow/implementation-handoff.md` and apply its **PLAN**
stage obligations: Produce source-grounded operation blueprints with explicit interfaces, algorithms and verification cases; design readiness precedes TASKS briefs.

## Existing Artifact Check

Before hooks or setup, inspect this feature's existing technical plan and supporting
artifacts. If accepted and no change is authorized, reuse/report them unchanged and
finish this command. For a scoped amendment, update affected sections/owners only;
preserve accepted decisions and evidence. `setup-plan.sh` skips copying its template
when plan.md exists; that behavior does not authorize the agent to replace the file
or regenerate its accepted supporting artifacts.

## Pre-Execution Checks

**Check for extension hooks (before planning)**:

- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_plan` key
- If the YAML cannot be parsed or is invalid, do not skip silently: tell the user that `.specify/extensions.yml` could not be read (include the parser error) and that no hooks were checked, including any mandatory (`optional: false`) hooks registered there, then continue normally
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- When constructing command invocations from hook command names, replace dots (`.`) with hyphens (`-`). For example, `speckit.git.commit` → `/speckit-git-commit`.
- For each executable hook, output the following based on its `optional` flag:
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Pre-Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **Mandatory hook** (`optional: false`):
    ```
    ## Extension Hooks

    **Automatic Pre-Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}

    Wait for the result of the hook command before proceeding to the Outline.
    ```
    After emitting the block above you MUST actually invoke the hook and wait for it to finish before continuing. Run it the same way you would run the command yourself in this agent/session (the invocation may differ from the literal `{command}` id shown above, e.g. a skills-mode agent runs it as `/skill:speckit-...` or `$speckit-...`). Emitting the block alone does not run the hook.
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently

## Outline

1. **Setup**: Run `.specify/scripts/bash/setup-plan.sh --json` from repo root and parse JSON for FEATURE_SPEC, IMPL_PLAN, FEATURE_DIR, BRANCH. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").

   `BRANCH` in this script's JSON is the feature-context identifier from
   `SPECIFY_FEATURE` or the feature-directory basename; it is not a verified Git
   branch. Read the actual current Git branch separately if reporting one.

2. **Load context**: Read FEATURE_SPEC, `.specify/memory/constitution.md` and IMPL_PLAN. For a new plan the setup script copies the resolved template; an existing plan remains its accepted document, not a fresh scaffold.

3. **Execute plan workflow**: Follow the applicable structure in IMPL_PLAN, preserving accepted content on scoped amendments:
   - Fill Technical Context (mark unknowns as "NEEDS CLARIFICATION")
   - Fill Constitution Check section from constitution
   - Record PASS, capability-specific N/A or BLOCKED for every gate; a complexity rationale cannot waive a mandatory principle
   - Phase 0: Resolve concrete relevant unknowns; create research.md only when it is a useful decision owner, otherwise record N/A
   - Phase 1: Design only applicable data/contracts/validation guidance; create supporting artifacts where useful and record omitted capabilities as N/A
   - Re-evaluate Constitution Check post-design; planning PASS is design compliance and planned evidence, not implementation or executed-test acceptance

## Mandatory Post-Execution Hooks

**You MUST complete this section before reporting completion to the user.**

Check if `.specify/extensions.yml` exists in the project root.

- If it does not exist, or no hooks are registered under `hooks.after_plan`, skip to the Completion Report.
- If it exists, read it and look for entries under the `hooks.after_plan` key.
- If the YAML cannot be parsed or is invalid, do not skip silently: tell the user that `.specify/extensions.yml` could not be read (include the parser error) and that no hooks were checked, including any mandatory (`optional: false`) hooks registered there, then continue to the Completion Report.
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- When constructing command invocations from hook command names, replace dots (`.`) with hyphens (`-`). For example, `speckit.git.commit` → `/speckit-git-commit`.
- For each executable hook, output the following based on its `optional` flag:
  - **Mandatory hook** (`optional: false`) — **You MUST emit `EXECUTE_COMMAND:` for each mandatory hook**:
    ```
    ## Extension Hooks

    **Automatic Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}
    ```
    After emitting the block above you MUST actually invoke the hook and wait for it to finish before continuing. Run it the same way you would run the command yourself in this agent/session (the invocation may differ from the literal `{command}` id shown above, e.g. a skills-mode agent runs it as `/skill:speckit-...` or `$speckit-...`). Emitting the block alone does not run the hook.
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```

## Completion Report

Command ends after relevant Phase 1 design. Report verified Git branch if relevant, feature context, IMPL_PLAN path, actual supporting artifacts, capability-specific N/A decisions and unresolved gates. Distinguish planned checks from executed evidence.

## Phases

### Phase 0: Resolve Relevant Unknowns

1. Inspect actual source, configuration, installed framework guidance and accepted
   decisions before identifying research needs. Research only a concrete unresolved
   technical question; an existing dependency does not itself require a research task.
2. Resolve technical unknowns using appropriate primary sources or scoped delegation
   when useful. A missing product decision stays an explicit decision gate; a research
   recommendation does not become owner acceptance.
3. Create or update `research.md` only when decisions need a separate durable record:
   decision, rationale and alternatives. If no such record is useful, record research
   as N/A with its capability reason in IMPL_PLAN. Preserve valid existing research.

**Output:** relevant decisions in IMPL_PLAN or `research.md`; unresolved blockers
remain visible. No empty research artifact is required.

### Phase 1: Relevant Design Artifacts

**Prerequisites:** applicable unknowns needed by the design are resolved; material
unresolved decisions block dependent design. `research.md` is not a universal prerequisite.

1. **Data design:** when persistence/entities change, record fields, relationships,
   invariants, validation and transitions in `data-model.md` or an existing clear owner.
   Otherwise record a reasoned N/A in IMPL_PLAN.
2. **Interface design:** when a wire/interface boundary changes, record exact
   producer/consumer contracts in `contracts/` or the accepted existing contract owner.
   Reuse shared schema and HTTP conventions. Otherwise record N/A with its reason.
3. **Validation guide:** create or update `quickstart.md` when setup or verification
   needs a distinct runnable guide. Include actual prerequisites, scoped commands,
   expected success/failure results and links to owning contract/data details.
   If the plan already holds the necessary concise instructions, use that owner and
   record no separate quickstart as N/A. This is planned verification, not an assertion
   that the feature is already implemented or tested.
4. Recheck every constitution gate against the completed design. Link applicable
   artifacts and record concrete N/A reasons. A planning PASS means the design follows
   policy and specifies adequate future evidence; implementation, backend acceptance,
   executed tests and release retain their own gates.

**Output:** IMPL_PLAN plus only relevant supporting artifacts. Preserve existing
accepted artifacts; omit empty files and document applicability in the plan.

## Key rules

- Use absolute paths for filesystem operations; use project-relative paths for references in documentation
- Mandatory gate failures remain BLOCKED until the actual design/requirement is corrected or a separately authorized constitutional amendment changes the rule; a justification table does not waive policy
- Unresolved material decisions block dependent design; record their exact scope and continue independent authorized planning

## Done When

- [ ] Applicable operation blueprints/source interfaces/ordered decisions and concrete verification cases filled; design readiness recorded with future TASKS briefs pending

- [ ] IMPL_PLAN completed with relevant design/artifact owners and capability-specific N/A reasons
- [ ] Constitution gates reviewed before research and after design; planning status distinguished from implementation/test acceptance
- [ ] Extension hooks dispatched or skipped according to the rules in Mandatory Post-Execution Hooks above
- [ ] Completion reported with verified Git branch if relevant, feature context, plan path, actual supporting artifacts/N/A reasons and remaining design gates
