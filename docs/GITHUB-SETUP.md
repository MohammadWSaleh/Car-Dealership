# GitHub setup (Phase IV requirement)

Phase IV asks for: a GitHub repository, an up-to-date README, Issues/Projects for bugs, features and milestones, commits and pull requests from every member, and the repo link in the final submission.

## 1. One member creates the repository (≈5 min)
On github.com: **New repository** → name `Car-Dealership` (or `full-stack-motors`) → private or public → no README/licence (we have ours). Then **Settings → Collaborators**: add the other four members. **Settings → Branches**: protect `main` (require a pull request and one approval).

## 2. Push the project (from the project folder, in VS Code terminal)
```powershell
git init -b main
git add .
git commit -m "Initial import: Full Stack Motors system"
git remote add origin https://github.com/<OWNER>/<REPO>.git
git push -u origin main
```
Check `git status` first: `node_modules`, `backend/data`, `dist` and `.env` must not appear (they are in `.gitignore`).

## 3. Every member clones and sets their identity
```powershell
git clone https://github.com/<OWNER>/<REPO>.git
cd <REPO>
git config user.name "Your Name"
git config user.email "the-email-on-your-github-account"
```

## 4. Create labels, milestones and issues
Install GitHub CLI (`winget install GitHub.cli`), run `gh auth login`, edit the five usernames at the top of `scripts/create-github-issues.sh`, then in Git Bash:
```bash
scripts/create-github-issues.sh <OWNER>/<REPO>
```
Then **Projects → New project → Board**, add the issues, columns New → In progress → In review → Tested → Done (same as OpenProject).

## 5. Each member's contribution (so everyone has commits and a PR)
Each member takes their issue(s) from the board:
```powershell
git checkout main; git pull
git checkout -b feature/<module>-<short-name>
# work, then
git add -A; git commit -m "FR-XXX-NN: what you did"
git push -u origin HEAD
gh pr create --fill     # or use the GitHub web page
```
A different member reviews and merges (squash). Feature work for F1–F6 is split by owner in the issue list so each member authors their own pull request.

## 6. Before submission
Paste the repository URL in the final submission, check the README renders, make sure all five members appear under **Insights → Contributors**, and export the OpenProject report.
