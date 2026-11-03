# Copyable phase requests

Use the existing protected product roadmap in root `plan.md`; preserve its phase
IDs, recorded draft/owner-review status and client-input gates. Do not regenerate
or reformat it as part of this workflow adoption. Constitution/docs adoption does
not approve or execute a product phase. The checked-in
[phase-delivery contract](phase-delivery.md) distinguishes that roadmap from each
feature's `specs/<feature>/plan.md`, selects its feature, and owns review/execution
boundaries. [Implementation handoff](implementation-handoff.md) defines the detailed
blueprints, bounded briefs and readiness required for the limited implementation
model. Replace `<PHASE_ID>` with an actual roadmap identifier; never infer it
from a feature folder or branch.

## Client invocation

| Client adapter                                           | Checked-in form          |
| -------------------------------------------------------- | ------------------------ |
| Codex, `.agents/skills/`                                 | `$speckit-specify`       |
| Claude / MiniMax, `.claude/skills/` / `.minimax/skills/` | `/speckit-specify`       |
| Kimi Code, `.kimi-code/skills/`                          | `/skill:speckit-specify` |
| OpenCode, `.opencode/commands/`                          | `/speckit.specify`       |

The examples below use Codex syntax. Substitute the same command's client form.
Only Codex and MiniMax are currently registered with the Spec Kit CLI here. The
other three clients have checked-in command files for their own discovery; this
is not an installation/registration claim.

These are agent invocations, not terminal commands or invented CLI flags. Confirm
that the client discovers the checked-in adapters; optional personal skills are not
required. Application development still needs the runtime prerequisites in the root
README and the feature's actual environment/services.

## One command

The shortest phase request can use its roadmap content directly:

```text
$speckit-specify PHASE_ID=<PHASE_ID>
Read root plan.md and docs/workflow/phase-delivery.md. Specify this phase only.
Reuse its matching accepted feature if it already exists.
```

```text
$speckit-clarify PHASE_ID=<PHASE_ID>
Apply docs/workflow/phase-delivery.md to the matching feature. Ask only unresolved
material questions, each with the simplest practical recommendation. Clarify only.
```

```text
$speckit-plan PHASE_ID=<PHASE_ID>
Apply docs/workflow/phase-delivery.md and docs/workflow/implementation-handoff.md.
Produce the matching feature's operation blueprints and design-readiness evidence only.
```

```text
$speckit-checklist PHASE_ID=<PHASE_ID>
Apply docs/workflow/phase-delivery.md. Generate a requirements-quality checklist only.
```

```text
$speckit-tasks PHASE_ID=<PHASE_ID>
Apply docs/workflow/phase-delivery.md and docs/workflow/implementation-handoff.md.
Generate bounded tasks with filled execution briefs, context references and concrete checks.
```

```text
$speckit-analyze PHASE_ID=<PHASE_ID>
Apply docs/workflow/phase-delivery.md and docs/workflow/implementation-handoff.md.
Analyze the matching artifacts and every in-scope task brief read-only; report readiness.
```

```text
$speckit-implement PHASE_ID=<PHASE_ID>
Complete the remaining accepted tasks in this selected phase. Apply
docs/workflow/phase-delivery.md, including checklist review, backend acceptance
before dependent frontend integration, meaningful tests and both review verdicts.
Check selected briefs/current source under docs/workflow/implementation-handoff.md
before writing; return material design gaps to the owning authorized planning step.
```

For a smaller implementation request, replace "Complete the remaining accepted tasks"
with `TASK_SCOPE=<exact task IDs or named dependency-safe batch>`. A clear whole-phase
request already supplies scope; no extra token or repeated batch approval is needed.

```text
$speckit-converge PHASE_ID=<PHASE_ID>
Apply docs/workflow/phase-delivery.md. Inspect the matching implementation and
recorded evidence. Only append traceable remaining tasks; make no other changes.
```

## An authorized sequence

```text
Deliver PHASE_ID=<PHASE_ID> from root plan.md using the checked-in Spec Kit commands
and docs/workflow/phase-delivery.md plus docs/workflow/implementation-handoff.md:
specify, clarify where needed, plan, checklist,
tasks, analyze, implement and converge. Reuse valid accepted artifacts and completed
foundations. This authorizes that sequence for this phase and necessary remediation
implementation/convergence until its exit gates pass. Ask only for genuinely missing
product decisions; continue independent authorized work. Stop after this phase.
```

Apply the roadmap's owner-review and client-input requirements to the actual request;
this launcher does not silently waive them or turn synthetic policies into confirmed
production inputs. The sequence authorizes routine internal continuation. It does not authorize a later
phase, commit/push, deployment or consequential external action unless that action is
also covered by the user's request. Missing evidence must remain explicit.
