# Plans

Design notes for work that spans more than one commit: the problem, the decisions
taken and why the rejected option was rejected. An ADR in `../decisions/` records
a structural choice; a plan here records a piece of work.

Delivered plans are kept rather than deleted — the reasoning is the point, and it
is what stops a later change quietly undoing a deliberate one.

| # | Plan | Status |
|---|---|---|
| [0001](0001-roles-tenancy-and-branding.md) | One product, two businesses, many colleges | Delivered |
| [0002](0002-batch-scoped-visibility.md) | Teach one batch, see one batch | Delivered |
| [0003](0003-per-college-palette.md) | Give a college the whole palette, not a tint | Delivered |
| [0004](0004-self-hosted-llm.md) | Swapping Gemini for a self-hosted model | Proposed |
| [0005](0005-browser-vscode.md) | A real VS Code in the code lab | Delivered (host mode) · Proposed (containers) |

See also [`../architecture/roles.md`](../architecture/roles.md) — the live
reference for who can reach what, which plans 0001 and 0002 produced.
