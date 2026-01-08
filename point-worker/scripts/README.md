This folder contains utility scripts used by the various Railway deployments.

build.worker.js (build gating script)
- Usage: This script is executed as the `build` command for the `point-worker` service on Railway.
- It checks git changed files and runs `npm run build` only if files relevant to the worker changed.
- Worker-relevant files include scripts that start workers, queue files in `lib`, `prisma/`, and project-level files like `package.json` and `tsconfig.json`.

Notes:
- The script uses `git diff` and best-effort `git fetch` to compare against `origin/main` — if git info is incomplete in the build environment it falls back to the last few commits and will trigger a full build.
- This is a best-effort gating mechanism; the most reliable solution is to also configure service watch paths in the Railway dashboard.
