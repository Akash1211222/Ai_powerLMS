# Plan 0005 — A real VS Code in the code lab

- Status: **Delivered** in host mode (local and single-trusted-user use) ·
  **Proposed**: the container launcher that makes it safe to host

## Context

The Skills → Code lab was a CodeMirror box and a Run button: one file, one
language, no terminal, nothing kept. Learners asked for the editor they will use
at work — extensions, a terminal, multi-file Node and React projects, any
language — and for their work to still be there tomorrow.

## The decision: embed VS Code, do not imitate it

"A VS Code replica" can be built two ways.

**Rejected — rebuild the workbench on Monaco.** Monaco is only VS Code's editor
widget. Extensions, the extension host, the terminal, debugging, language
servers, source control and port forwarding are the other ninety percent, and
would each be a project. Browser-only runtimes (WebContainers) run Node but not
Python, Java or C, and their commercial licence does not fit.

**Chosen — run code-server.** [code-server](https://github.com/coder/code-server)
(MIT) *is* VS Code, recompiled to serve its workbench over HTTP. Open VSX
provides the extension gallery. Nothing about the editor is ours to maintain; the
work is only in starting it per learner and letting exactly that learner in.

## How it fits together

```
browser ──(LMS page, :3000)──► iframe src = API /ide/<slug>/?fca_ticket=…
                                        │
                       IdeProxy (raw HTTP server, before helmet/body parsers)
                        ticket → httpOnly cookie → verify on every request/ws
                                        │  unix socket (0600)
                                code-server for that learner
```

- **One instance per learner** (`IdeService`), started on first open, reused on
  the next, stopped `IDE_IDLE_MINUTES` after the last tab closes. Capped at
  `IDE_MAX_INSTANCES`: each is ~350 MB.
- **Unix sockets, not ports.** Nothing but the API can reach an instance, so
  code-server runs with `--auth none` and the proxy is the only door.
- **Ticket, then cookie.** The workbench makes hundreds of requests and several
  websockets that cannot carry a bearer header. `POST /api/v1/ide/session`
  returns a one-minute, single-use ticket in the iframe URL; the proxy swaps it
  for a cookie scoped to `/ide/<slug>`. Both are signed with a key *derived from*
  the access-token secret, so neither verifies as an API token.
- **A clean environment.** The learner's terminal inherits a PATH, HOME and
  LANG built from scratch — not the API's environment, which holds the database
  URL and JWT secrets.
- **Kept work.** Workspace, settings and extensions live under `IDE_DATA_DIR`
  (`~/.fca-ide/users/<id>`). Restarting an instance never touches files.
- **Extensions.** `pnpm ide:setup` installs a default set once (Python, Java,
  C/C++ via clangd, ESLint, Prettier, Tailwind, Code Runner) into a template
  copied into each new learner's folder. Learners install anything else from
  Open VSX themselves.
- **Previewing apps.** code-server forwards ports at `/ide/<slug>/proxy/<port>/`
  (prefix stripped — Express and friends just work) and
  `/ide/<slug>/absproxy/<port>/` (prefix kept — for Vite, started with
  `--base "$FCA_PREVIEW_BASE/<port>/"`). Both sit behind the same cookie.

## What host mode is not: a sandbox

Every instance runs as the API's OS user. A learner's terminal can read other
learners' workspaces, the repository, and `.env`; `/proxy/<port>` reaches any
port on the host. Two learners' dev servers also compete for the same ports.

That is acceptable on a developer's own machine and nowhere else. A flag that
defaults off was not judged enough — nothing stops it being set — so
**`NODE_ENV=production` with `IDE_ENABLED=true` refuses to boot**, and the
production nginx config has no `/ide/` route. Both change only when the
container launcher lands.

The cookie is also held to the workbench: it is `SameSite=Lax` (web and API
are one site), anything but GET/HEAD/OPTIONS and every websocket must carry the
workbench's own `Origin`, proxied pages send `Referrer-Policy: same-origin` so
workspace paths do not leak, and signing out stops the instance — the cookie is
bound to it, so it then opens nothing.

## Proposed — the container launcher

To host this for real, each instance runs in its own container instead of as a
child process. `IdeService.start` is the only thing that changes:

- `docker run --rm --user 1000 --memory 1g --cpus 1 --pids-limit 512
  --network <egress-only> -v <user-volume>:/home/coder ghcr.io/coder/code-server`
  with the socket (or a port on a private bridge) as the proxy target;
- a per-learner volume in place of the host folder;
- no route from the container to the database, Redis or the API's own port.

The proxy, tokens, web component and data layout are unchanged by that swap.
Landing it also means lifting the production refusal in `validateEnv` and
adding an nginx `/ide/` location with websocket upgrade headers — declaring its
own `add_header` set, since the server-level `X-Frame-Options` would block the
web app framing the workbench.

**Capacity is the real constraint.** The current 1-vCPU / 4 GB box cannot hold
more than two or three instances beside the LMS itself. Hosting the IDE for a
cohort means a separate machine (or a managed option such as Coder/Gitpod) sized
at roughly 1 GB RAM and a share of a core per concurrent learner.
