# Contributing

## Branch workflow

All changes go through a branch — never commit directly to `main`.

```
git checkout -b feature/short-description   # or fix/, chore/, release/
# ... make changes ...
git add <files>
git commit -m "Short description of what and why"
git push -u origin feature/short-description
# open a PR on GitHub, review, merge to main
```

Branch naming:
- `feature/` — new functionality
- `fix/` — bug fixes
- `chore/` — maintenance, deps, tooling
- `release/` — release prep (changelog, version bump, tag)

## Releases

Releases are tagged on `main` after merging the release branch.

```
git tag -a v0.x.0 -m "Release notes here"
git push origin v0.x.0
```

Tag format: `vMAJOR.MINOR.PATCH` (semver).

Release notes format (used in tag messages):
```
vX.Y.Z — Short title

Features
- ...

Fixes
- ...

Admin / Internal
- ...
```

## Commit style

Short imperative subject line (50 chars), no period. Body if the why isn't obvious.
