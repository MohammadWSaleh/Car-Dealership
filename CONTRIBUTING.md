# How we work (Full Stack Motors team)

1. **One issue per task.** Pick an issue from the board, assign yourself, move it to *In progress*.
2. **One branch per issue** from an up-to-date `main`: `feature/<module>-<short-name>` or `fix/<short-name>`.
3. **Small commits** with the requirement ID first, e.g. `FR-CAT-04: show monthly installment on car cards`.
4. **Open a pull request** into `main` using the template. At least one *other* member reviews it. CI (backend and frontend tests) must be green.
5. **Merge with "Squash and merge"**, delete the branch, close the issue, move the task to *Done* in OpenProject.

Rules: never push straight to `main`; never commit `node_modules`, `backend/data`, uploads or `.env`; do not commit work you cannot explain, because every member presents their own part.

Run before every pull request:

```bash
cd backend  && npm test
cd frontend && npm test && node scripts/check-i18n.mjs && npm run build
```
