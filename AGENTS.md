<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Session workflow (agents: follow this)

See **CONTRIBUTING.md** for the full process. In every session:

1. **Branch first.** Create a branch off an up-to-date `main` for the work (`feature/…`, `fix/…`, `chore/…`). Do **not** commit feature work straight to `main`.
2. **Build before committing.** `npm run build` must compile clean; commit in logical chunks.
3. **Merge to `main` when verified.** Merging to `main` **deploys to production** on Vercel (PRs optional). Confirm the production deploy goes green.
4. **Tag releases.** After a body of work, update `CHANGELOG.md` and cut an annotated semver tag (`vX.Y.Z`) with Added / Changed / Fixed / Removed notes.

Gotchas: `main` is the production branch (other branches only get Preview deploys). Secrets live in Vercel env vars, not `.env.local`. Never put the admin PIN in commits, notes, or docs.
