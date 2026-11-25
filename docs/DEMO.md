# Demo script (10–12 minutes)

Start the system (`cd backend && npm start`), open http://localhost:3000. Password for every account: `Fsm@2026!`.

| Min | Who | What to show | Requirements |
|---|---|---|---|
| 0:00 | Presenter | Problem and idea: one fixed price, honest availability. Architecture slide (one Node process, SQLite, React). | — |
| 1:00 | Visitor | Catalogue: filters, price in USD + LBP, In stock / In transit / Order only, compare 3 cars, instalment calculator, running-cost comparison. | FR-CAT-01…07 |
| 3:00 | Visitor | Switch to Arabic (layout flips). EV readiness check → shortlist. Chat assistant answers a price question. | NFR-USA-01, FR-EV-*, FR-VA-* |
| 4:00 | Visitor | Book a test drive (no account), upload licence. | FR-TD-01 |
| 5:00 | `consultant1@fsm.lb` | Verify licence, complete checklist (EV battery rule). New walk-in lead → quotation (accessories; an extra item goes to approval). Record deposit → car reserved, price locked 30 days. Create contract, attach signed copy. | FR-TD-02/03, FR-DEAL-*, FR-PAY-01/02 |
| 7:30 | `manager@fsm.lb` | Approve the price exception; catalogue price change (price history); import stock CSV → waiting deposit gets the car (first in, first served); reports with charts. | FR-DEAL-04, FR-CAT-08, FR-INV-*, FR-REP-* |
| 9:00 | `accountant@fsm.lb` | Receive balance, invoice, refund request → manager approves. | FR-PAY-*, FR-INV-* |
| 10:00 | `delivery@fsm.lb` | Inspection checklist, registration documents, handover form, signed copy → delivered, owner joins Owners Circle. | FR-DEL-*, FR-OC-01 |
| 11:00 | `admin@fsm.lb` | Audit log shows who changed the price; notification outbox (Arabic message); backups. | FR-ADM-*, FR-NOT-*, NFR-REL-01 |
| 11:30 | Presenter | GitHub/OpenProject view, 95 automated tests passing, traceability matrix, limitations. | — |

## Extra demo moments (F1-F6)

| What | Where | Say |
|---|---|---|
| Drag the monthly budget slider | `/cars` | "Customers think in monthly payments, so the catalogue sorts itself by what they can afford." |
| EV savings chart | Open a Kia EV6 | "Fuel and electricity prices are set by the sales manager, so the chart always matches today's prices." |
| Price history and lock badge | Any car page | "The price is public, fixed, and locked once a customer has a quote." |
| Trade-in estimate | `/trade-in` | "An instant range, then a consultant confirms a real offer valid for 7 days." |
| QR pass and check-in | Book a test drive, then staff **Test drives** | "The customer shows the QR, the consultant checks them in; no paperwork." |
| Order tracker | `customer@fsm.lb` -> order | "Every step, an estimated delivery date, and what the customer should bring on the day." |
