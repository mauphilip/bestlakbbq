# Contributing & Development Workflow

This project auto-deploys to Vercel. **`main` is the production branch — every merge to `main` deploys to production** ([socalkbbq.com](https://socalkbbq.com)). Treat `main` as always-deployable.

> ⚠️ **Lesson learned:** work that lands only on a non-production branch (e.g. `release/*`, `staging`) gets a **Preview** deploy, *not* production. If something "isn't showing up live," check that it was actually merged into `main`.

---

## Per-feature workflow

Every new session / piece of work follows this loop:

### 1. Branch
Start from an up-to-date `main`. Never commit feature work straight to `main`.
```bash
git switch main && git pull
git switch -c feature/<short-name>     # or fix/<name>, chore/<name>
```
Prefixes: `feature/` (new functionality) · `fix/` (bug fix) · `chore/` (tooling, docs, cleanup) · `release/` (release prep).

### 2. Plan, then build
Implement the change. Keep it green before committing:
```bash
npm run build            # must compile clean
npx eslint .             # when you've touched several files
```

### 3. Commit (logical chunks)
- **subject**: imperative, ≤ ~72 chars (`Add re-link tool`, not `added stuff`), no trailing period
- **body**: what changed and *why* (when not obvious)
- **footer**: `Co-Authored-By: …` when applicable

### 4. Push the branch
```bash
git push -u origin feature/<short-name>
```
Vercel builds a **Preview** deploy for the branch — verify on that URL before going to production.

### 5. Integrate into `main`
PRs are **optional** — pick what fits the work:

- **Direct merge** (fine for solo, low-risk work):
  ```bash
  git switch main && git pull
  git merge --no-ff feature/<short-name>
  git push
  git branch -d feature/<short-name>
  ```
- **Pull request** (when you want a review trail or to sit on the preview a while):
  ```bash
  gh pr create --fill
  gh pr merge --merge --delete-branch     # after reviewing the preview
  ```

**Merging to `main` deploys to production.** Confirm the deploy goes green (Vercel dashboard, or the commit's "Vercel" status check on GitHub).

---

## Releases & tags

After a meaningful body of work (one or several features), cut a release:

1. **Update `CHANGELOG.md`** — move items from `[Unreleased]` into a new version section dated today.
2. **Tag it** (annotated, [semver](https://semver.org/)):
   ```bash
   git tag -a v0.2.0 -m "v0.2.0 — <headline>"
   git push origin v0.2.0
   ```
3. **(Optional) publish GitHub release notes:**
   ```bash
   gh release create v0.2.0 --notes-file <notes.md>   # or --generate-notes
   ```

Production is already live from the `main` merge — the tag/release is the human-readable marker of *what shipped*.

### Release-notes format
High-level and user-facing (not commit-by-commit). Group as:
```
## [0.2.0] — YYYY-MM-DD
### Added      — new features
### Changed    — behavior/UX changes to existing features
### Fixed      — bug fixes
### Removed    — things taken out
```

---

## Project notes / gotchas

- **Production branch = `main`** (see the warning up top).
- **Secrets** live in **Vercel → Project → Settings → Environment Variables** (Production / Preview / Development scopes). `.env.local` is laptop-only for `next dev` and is gitignored — it does **not** need the production keys. Never commit secrets or paste the admin PIN into commits, notes, or docs.
- **Data model:** `data/restaurants.json` (committed base data) **+ Vercel KV** (Upstash Redis) overrides, merged at request time by `lib/getRestaurants.ts`. KV is a key→value store (not SQL); keys are prefixed `kbbq_restaurant_…` / `kbbq_visit_…`.
- **Build:** `npm run build` (Next.js 16). The build does not fail on ESLint findings, but keep new code lint-clean.
