# Full Stack Motors — Car Dealership System

*One stack. One price. Your car.* — CSC490 Software Engineering project (Phase IV: implementation).

A web platform for a new-car dealership in Lebanon: fixed non-negotiable USD prices (with LBP equivalent), live availability, test-drive booking, deposits and contracts, delivery workflow, Owners Circle loyalty programme. Arabic (right-to-left) and English. All **70 functional** and **15 non-functional** requirements of the Phase III SRS are implemented — see `docs/TRACEABILITY.md`.

## Architecture (deliberately simple)

One Node process serves both the API and the web app.

```
Browser ──HTTPS──> (Caddy, optional) ──> Node 22 + Express 5  ── SQLite file (WAL)
                                          ├─ /api/*  REST, JWT, role checks, audit log
                                          └─ /*      React single-page app (frontend/dist)
```

| Part | Technology |
|---|---|
| Backend | Node 22, Express 5, better-sqlite3, JWT, bcryptjs, PDFKit, helmet |
| Frontend | React 18, Vite, React Router, TanStack Query, i18next, Tailwind CSS, Recharts |
| Tests | Vitest + Supertest (backend, 164 tests), Vitest + Testing Library (frontend, 61 tests), Playwright (system suite) |

Backend modules (`backend/src/modules`): accounts, catalogue, testdrives, assistant, ev, deals, payments, inventory, delivery, ownerscircle, reports, admin. Business rules shared by modules live in `services/core.js`.

## Run it

Requirements: Node 22 or newer.

```bash
cd frontend && npm install && npm run build      # builds the web app into frontend/dist
cd ../backend && npm install && npm start        # http://localhost:3000
```

The first start creates `backend/data/fsm.db` and fills it with demo data (15 car trims, stock, promotion, accessories, ten accounts and sales scenarios at every stage). Reset with `npm run seed -- --reset`.

Development with hot reload: run `npm run dev` in `backend` (port 3000) and `npm run dev` in `frontend` (port 5173, proxies `/api`).

### Demo accounts (password `Fsm@2026!`)

| Role | Email |
|---|---|
| Administrator | admin@fsm.lb |
| Sales Manager | manager@fsm.lb |
| Sales Consultants | consultant1@fsm.lb, consultant2@fsm.lb |
| General Manager | gm@fsm.lb |
| Accountant | accountant@fsm.lb |
| Delivery Coordinator | delivery@fsm.lb |
| Customers | customer@fsm.lb, customer2@fsm.lb, owner@fsm.lb (Owners Circle member, Arabic) |

### Tests and checks

```bash
cd backend  && npm test             # 164 tests; names start with the requirement ID, e.g. npm test -- -t "FR-PAY-04"
cd backend  && npm run loadtest     # NFR-PERF-01: 50 users, p95 under 3 s (starts its own server; or set `BASE_URL` to test a running one)
cd frontend && npm test             # formats, language switch, translated status badges
cd frontend && node scripts/check-i18n.mjs   # every text key exists in English and Arabic
```

Phase III's 85 test cases can be run against the demo data; `docs/DEMO.md` lists the screens for each role.

### Configuration (environment variables)

`PORT` (3000), `DB_PATH`, `UPLOAD_DIR`, `BACKUP_DIR`, `JWT_SECRET` (**set in production**), `DOC_KEY` (upload encryption key), `STAFF_SESSION_MINUTES` (15), `CUSTOMER_SESSION_HOURS` (8), `TLS_KEY` + `TLS_CERT` (serve HTTPS directly), `SEED_ON_EMPTY=0` (no demo data). Business values (VAT, exchange rate, referral credit, hours, thresholds) are changed in the app under **Settings** (NFR-MNT-01).

### HTTPS (NFR-SEC-01)

Either set `TLS_KEY`/`TLS_CERT`, or put Caddy in front using `deploy/Caddyfile` (TLS 1.2 and 1.3 only). The server sends HSTS and other security headers.

### Backups (NFR-REL-01)

A backup runs every day (SQLite online backup, 14 kept) and on demand under **Backups**. Restore: `npm run restore -- <backup-name>`.

## Where things are

```
backend/src/modules/   one file per SRS module (routes + rules)
backend/src/services/  auth, core business rules, PDFs, notifications, settings, backup
backend/tests/         164 tests named by requirement ID
frontend/src/pages/    public site and customer portal
frontend/src/staff/    staff console (role-based menu)
docs/                  traceability matrix, demo script, manual checks, team plan
```

## Design decisions and known limitations

- **SQLite instead of PostgreSQL.** One file, no database server to install, transactional and fast enough for one dealership; the SQL is plain and portable.
- **Simulated notifications.** E-mail and WhatsApp messages are written to a notification outbox (visible to the administrator) in English or Arabic according to the customer's language and opt-in; nothing is sent to real providers. Replace `services/notify.js` `send()` to connect SMTP or the WhatsApp API.
- **PDFs are in English.** The PDF library cannot shape Arabic text; screens and notifications are fully bilingual.
- **Stamp duty** is a setting (default 0.4% of the contract) pending confirmation with the accountant.
- **Plug-in hybrid running cost** assumes half of the driving is electric.
- A car is marked *Sold* when the contract is signed; a walk-in buyer gets an account automatically at handover.
- No real payment gateway: payments are recorded by staff (cash, transfer, cheque, card terminal) as in the SRS.

## Test levels
`npm test` (backend: unit + component), `npm run test:system` (the module tests over real HTTP against a live server), `npm test` in `frontend`, and `python3 system-tests/system_suite.py` (68 black-box browser/security/load/TLS/backup checks). Results and requirement coverage: `docs/TEST-REPORT.md`.

## Team and contributing

Work is tracked in GitHub Issues and the project board; every change goes through a pull request reviewed by another member (`CONTRIBUTING.md`). CI runs the backend and frontend tests on each pull request. Module ownership per member: `docs/TEAM-PLAN.md`. Repository setup commands: `docs/GITHUB-SETUP.md`.
