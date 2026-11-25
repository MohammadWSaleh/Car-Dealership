# GitHub and OpenProject plan (Phase IV)

Repository workflow: `main` is protected; every task is a short-lived branch `feature/<module>-<short-name>` and a pull request reviewed by one other member. Commit messages start with the requirement ID (e.g. `FR-PAY-04: refund needs manager approval`). Each OpenProject work package carries the requirement IDs it covers and links to its pull request.

Suggested split (adapt to what each member actually did — the commit history and OpenProject must match the table):

| Member | Modules | Requirements |
|---|---|---|
| Mohammad Wajih Mohammad Saleh | Platform and sales flow: accounts, deals, payments, admin, security, backups | FR-ACC, FR-DEAL, FR-PAY, FR-ADM, NFR-SEC/REL/MNT/DAT |
| Badih El Halabi | Catalogue and customer web: catalogue, comparison, calculators, public site, i18n/RTL | FR-CAT, NFR-USA/LOC/CMP |
| Mustafa Kassem Hammoud | Test drives and assistant: booking, licence check, checklist, chat assistant, EV check | FR-TD, FR-VA, FR-EV |
| Mariam Abadi | Inventory and delivery: stock, CSV import, waiting list, alerts, inspection, handover | FR-INV, FR-DEL |
| Ali El Hajj | Loyalty, reporting and quality: Owners Circle, notifications, reports, tests, load test | FR-OC, FR-NOT, FR-REP, NFR-PERF |

OpenProject board columns: New → In progress → In review → Tested → Done. Sprint 1: database, accounts, catalogue. Sprint 2: deals, payments, test drives. Sprint 3: inventory, delivery, loyalty, reports. Sprint 4: tests, polish, presentation.

## UX enhancement log (22/11/2026)
Photo gallery and upload, home finder, URL filters and budget slider, one-tap test-drive booking, deals board and next-step banner. See `docs/TEST-REPORT.md` section 2b.
