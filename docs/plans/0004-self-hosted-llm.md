# Plan 0004 — Swapping Gemini for a self-hosted model

- Status: **Proposed**

## Context

The LMS calls an LLM for nine features, currently Google Gemini. A self-hosted
model is being trained to take over. This plan is what it has to accept and
return, and what is worth training it on.

## The thing that reframes the question

**The model does not need to be trained before it can be connected.** The LMS
never relies on it remembering anything — every call carries its own full
context: the rubric, the computed risk score, the student's metrics, the
submitted code. The model is asked to read what it was handed and answer in a
fixed JSON shape.

So connecting is small. Training, when it comes, is training on *obedience to
those shapes* — not on student data.

## The single funnel

Every one of the nine features goes through one function in
`packages/ai/src/complete-json.ts`:

```
completeJson(system, user, maxTokens) → parsed JSON
someZodSchema.parse(json)              // throws if the shape is wrong
```

Two strings in, one JSON object out, a schema gate behind it. Point that at a new
server and all nine move at once.

## What the server must expose

Make it **OpenAI-compatible** (`POST /v1/chat/completions`). llama.cpp, Ollama,
vLLM, LM Studio and TGI already speak it, so there is no server code to write and
about forty lines to add here: one branch in `resolveLlmConfig`, one
`completeLocal`, one `LocalProvider`.

`choices[0].message.content` must be a JSON *string* parsing to the requested
shape. Fences are stripped defensively by `extractJson`, but anything else around
the object is a coin flip.

## The nine jobs

Grouped by what breaks when the model is wrong.

**Marks** — changes a student's score.
| Job | Budget |
|---|---|
| `evaluateSubmission` (text and code variants) | 1500 |

Every `criterionId` must be one the LMS sent; an invented id fails the gate. The
final mark is computed by the platform from per-criterion scores — the model
never returns a total.

**Advice** — read by staff and students, decides nothing.
| Job | Budget |
|---|---|
| `generateRecoveryPlan` | 1500 |
| `generateProgressReport` | 1500 |
| `enrichInsightWithLlm` | 4096 |
| `enrichCohortBriefingWithLlm` | 3072 |

**Content** — a human sees it before a student does.
| Job | Budget |
|---|---|
| `generateAssessment` (quiz / MCQ) | 3500 |
| `generateAssignment` | 4096 |
| `generateCodeHint` | 1024 |

`scoreJobStudentMatch` runs on deterministic scoring and needs no model.

Exact output schemas live in `packages/ai/src/schema.ts`,
`recovery-schema.ts`, `report-schema.ts`, and inline in `generate-assessment.ts`,
`code-hint.ts` and `narrate-insight.ts`. The limits there are enforced, not
advisory.

Two rules `generateAssessment` enforces *after* parsing, so a model that ignores
them silently loses questions: every objective question needs at least two
options and at least one `isCorrect: true`, and `TRUE_FALSE` must have exactly
True/False. Fewer than three surviving questions and the batch is discarded.

## Three non-negotiables

| Rule | If broken |
|---|---|
| Only a JSON object — no prose, no fences | Parse throws, feature silently degrades |
| **Never invent a number** — risk scores, attendance, marks arrive computed | No error; it just publishes something false |
| Respect array and string limits | Parse throws on the whole response |

The second is the one a small local model will fail at, and the one nothing
catches.

## The trap to fix first

Every call is wrapped in `catch { return heuristic() }` — no log, no metric, no
alert. The fallback is good design: a dead model must not take assignment
submission down with it. But it means a model returning *almost*-right JSON makes
the LMS quietly stop using AI and serve the canned heuristic instead. Screens
stay full. Nothing goes red. You find out weeks later.

**Before switching providers, that `catch` must record which provider answered
and why it fell back.** Then "is my model actually being used?" is a number
rather than a hope.

## Training

1. **Constrain decoding before fine-tuning anything.** GBNF for llama.cpp, JSON
   Schema for vLLM/TGI. Converting each zod schema once is cheaper and more
   reliable than teaching the shape by example.
2. **Then fine-tune on real traffic.** Log the `(system, user, validated output)`
   triple for every call that passes the schema gate; in a few weeks that is a
   training set drawn from real courses, rubrics and student work.

Two cautions. That data carries student names, submitted work and risk scores —
personal data, and it belongs on your own machine, not a public fine-tuning
service. And it teaches the model to imitate Gemini *including its mistakes*, so
review the grading examples before training on them; those are the ones that
change a mark.

A few hundred examples per task fixes format obedience; tone and judgement need
thousands. Keep every task in the set — training on grading alone makes the
coaching worse.

## Order of work

1. Make the silent fallback visible, so the rest is measurable.
2. Stand the model up behind an OpenAI-compatible endpoint with grammar-constrained JSON.
3. Add `AI_PROVIDER=local`. The nine features need no changes.
4. Shadow-run for a week: both answer, both logged, neither shown. Compare on parse rate first, then on marks.
5. Switch the advice jobs first — people can disagree with them.
6. Switch grading last, once the parse rate is boring.
