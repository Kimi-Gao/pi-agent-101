# AGENTS.md

Agent / automation conventions for this project. Claude Code should read this first on session start.

## Hard rules (non-negotiable)

- **File size limit: 300 lines per file.** Any file exceeding 300 lines MUST be split before commit. No exceptions, no excuses.
  - Split strategies (pick what fits):
    - Extract a sub-component / sub-module into its own file.
    - Move types to a sibling `*.types.ts`.
    - Move constants / config to `constants.ts` or `config.ts`.
    - Break a long function into smaller helpers.
  - Applies to: `.ts`, `.tsx`, `.js`, `.jsx`, `.css`, `.md`, `.json`, `.yaml`, `.yml`. Generated files (`dist/`, `node_modules/`, `pnpm-lock.yaml`) are exempt.
  - When checking on a diff: `git diff --stat` and `git ls-files | xargs wc -l | sort -n` — anything red must be split before commit.
  - If a file genuinely cannot be split (large generated table, big data fixture), leave a short comment at the top with the reason so it can be revisited later.

- **Auto-commit every conversation that produces code.** When a turn ends with code changes (new files, edits, or deletions inside this repo), Claude MUST stage and commit them before handing back. No "I'll let you commit it" handoff.
  - Commit message in **English**, imperative mood, short subject line.
  - **No `Co-Authored-By: Claude` trailer.** The user is the sole author of every commit; do not add any co-author trailer (Claude, GitHub Copilot, etc.).
  - **Push immediately after every commit.** Once `git commit` succeeds, run `git push` (or `git push -u origin <branch>` if the branch has no upstream yet) before handing back. Treat the push as part of the commit step, not a separate handoff. If push fails (auth, network, remote rejection), surface the error verbatim and do **not** retry indefinitely — the local commit is already durable. The only exception is when the user explicitly says "don't push yet" in the same turn.
  - Exceptions: pure-research / pure-question turns, and turns where the user explicitly says "don't commit yet" — those skip.
  - One commit per turn is the default. If a turn covers multiple unrelated changes, split into multiple commits with `git add <path>` per commit.

- **Bilingual sync is mandatory.** This repo has two language branches: `main` (English) and `cn` (Chinese). A doc change landed on only one side is a bug — both must stay in sync.
  - **中文 → 直接改在 `cn` 分支. English → edit directly on `main`.** 对应语言的内容在对应分支上直接编辑、commit、推送。
  - **不要新建分支** — 不要为双语同步创建 `*-bilingual-sync`、`*-cn` 之类的临时分支或 worktree。当前分支不对就先 `git checkout` 切换:`中文 → cn`,`English → main`。
  - 同一回合跨语言时:在 `main` 上做完英文 commit 并 push → `git checkout cn` → 加中文对应版本 commit 并 push。两次切换都在同一个 turn 内完成,中间不要开 PR、不要新分支;反之亦然(中文先也行)。
  - Scope: any prose a user reads (READMEs, AGENTS.md, `docs/`, comment blocks in source). Pure code, lockfiles, generated artifacts, and identifiers are exempt.
  - If a doc file only exists on one side (e.g. a brand-new file), create the empty stub on the other branch in the same sync commit so future edits always have a counterpart.

## Tool preferences

- **Search**: prefer `mcp__MiniMax__web_search`. Fall back to `WebFetch` when MCP is unavailable.
- **Don't** use the built-in `WebSearch` (backend returns 400).
- **Run web**: `pnpm dev` opens port 5173. Use the `run` skill to launch and screenshot.

## Workflow baseline

1. New task → `git status` to see current state.
2. After editing source → `pnpm build` (runs `tsc -b`) to verify types.
3. UI changes → `run` skill to launch and screenshot.
4. Before commit → `verify` skill for end-to-end confirmation.
5. PR description / commit / docs: English preferred.

## Known pitfalls

- **Pinned commit author**: global `git` config is already correct. Don't override with `git -c user.email=…` again (already stepped on this).
- **Zustand selectors**: returning a new object triggers re-renders. Either slice with `useStore(s => s.x)` or wrap with `useShallow`.
- **SWR mutate**: after mutating data, invalidate precisely with `mutate(key)`. Avoid `mutate(() => true)` which re-fetches everything.
- **oxlint is fast**: but it only checks syntax / simple rules — no React-specific lint rules. Add ESLint when stricter rules are needed.
- **Vite cache**: if `node_modules/.vite` corrupts, run `pnpm dev --force`.
- **New deps**: `pnpm add <pkg>` for runtime, `pnpm add -D` for dev-only.

## Style

- Comments follow the code language; English preferred.
- Naming: components PascalCase, functions camelCase, constants UPPER_SNAKE.
- Error handling: SWR fetchers must throw; components use `try/catch` or the `error` branch.
- Tests: Vitest later — not in the scaffold yet.
