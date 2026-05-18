# Contributing to noztos

Thanks for wanting to help. This is a small project — keep contributions focused and we'll move fast.

## TL;DR

1. Fork the repo, clone your fork.
2. Create a branch: `git checkout -b fix/short-name` or `feat/short-name`.
3. Make your changes. Run `npx tsc --noEmit` to confirm types check.
4. Commit with a clear message (`fix: ...`, `feat: ...`, `chore: ...`).
5. Push to your fork, open a PR against `main` of this repo.
6. Wait for review.

## Before opening a PR

- **Open an issue first** for anything bigger than a bug fix. Saves you wasted work if the direction doesn't fit.
- **One change per PR.** Bug fix + refactor in the same PR will get bounced back.
- **No new dependencies** without a comment in the PR explaining why an existing dep wouldn't work.
- **No new top-level files** unless required (no `NOTES.md`, no `TODO.txt`, etc).

## Local setup

See [README.md](README.md) for the full setup. Quick version:

```bash
npm install
cp .env.example .env  # edit DATABASE_URL, NODE_SECRET at minimum
npx prisma migrate deploy
npm run dev           # terminal 1
cd companion && npm install && npm run build && npm install -g . && cd ..
noztos login <token>  # terminal 2 — token from localhost:3000 after signup
```

## Code conventions

- TypeScript strict — avoid `any`, use `unknown` + narrow.
- Default to no comments. Only add one when *why* is non-obvious.
- Edit existing files, don't create new ones unless asked.
- Don't add error handling for scenarios that can't actually happen.
- Don't refactor working code "to clean it up" without a stated reason.

## Architecture rule

This project is **single-machine, local-first**. Don't introduce:
- A cloud-hosted backend
- Server-side `child_process.exec` against `/Users/...` paths assuming the user's Mac
- Anything that breaks if Next.js runs on a different host than the user's projects

If a feature needs a multi-machine architecture, open an issue to discuss before coding.

## What kinds of changes are welcome

- Bug fixes (especially with a clear repro)
- Performance improvements with a benchmark
- New CLI workflows (slash commands like `/build`, `/debug`)
- New file types in the editor / explorer
- Cross-platform fixes (Windows / Linux paths, signals, etc)
- Documentation fixes

## What kinds of changes are NOT welcome (without prior discussion)

- Multi-tenant / cloud-hosting architecture
- New AI providers (the integration surface is Claude Code's CLI — switch the provider via Claude config, not in noztos)
- Major UI redesigns
- Renaming the project

## Reporting bugs

Use the issue template. Include:
- OS + Node version
- Steps to reproduce (the smaller the better)
- What you expected vs what happened
- Output from the daemon log (`/tmp/noztos-companion.log` on macOS) if relevant

## License

By contributing, you agree your contributions will be licensed under the MIT License (same as the project).
