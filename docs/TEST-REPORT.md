# Test report — Full Stack Motors (Phase IV)

Test session date: 22/11/2026. Three levels were run on the complete system. All results below come from the runs described under "How to reproduce".

## 1. Result at a glance

| Level | What is tested | Tool | Tests | Result |
|---|---|---|---|---|
| **Unit** | Pure logic and services in isolation: instalment, running cost, VAT split, stamp duty, EV rules, validators, date/clock, settings validation, password hashing, token lifetimes, notification templates (EN/AR), document encryption, PDF receipt; frontend helpers (money, dates, API client, i18n) | Vitest | 67 backend + 19 frontend | **all pass** |
| **Component** | Each backend module through its API with the real database (accounts, catalogue, test drives, assistant, EV, deals, payments, inventory, delivery, Owners Circle, admin, reports, platform); each React component/page with mocked API | Vitest, supertest, Testing Library | 96 backend + 34 frontend | **all pass** |
| **System** | The whole product running as a separate server process with its own SQLite file: (a) the 111 module tests re-run over real HTTP against that process; (b) 76 black-box checks: real browser journeys, TLS, security, load, backup/restore, responsive layout, other browser engines | Vitest over HTTP; Playwright (Chromium, Firefox, WebKit) | 96 + 68 | **all pass** |

Totals: 185 backend tests + 79 frontend tests + 111 over-HTTP re-runs + 76 system checks. Translation check: 589 keys used, 821 English = 821 Arabic.

**Coverage of the SRS: all 85 requirements (70 functional, 15 non-functional) are exercised by at least one automated test; see section 3.** Four non-functional requirements also need a human measurement (section 5).

## 2. Defects found during this session and fixed

| # | Found by | Defect | Fix |
|---|---|---|---|
| 1 | System (browser, NFR-USA-04) | On a phone-width screen (360–412 px) the staff console grew to about 1,300 px wide, so the whole page scrolled sideways: the menu strip stretched its grid column. | `Console.jsx`: grid column is now `minmax(0,1fr)` and the sidebar `min-w-0`; the menu strip scrolls inside its own box. Re-tested at 360, 412, 768, 1024, 1280, 1920 px: no overflow. |
| 2 | System (WebKit/Safari, NFR-CMP-01) | Over plain HTTP, Safari showed a blank page: the security policy `upgrade-insecure-requests` made it request every script as https. | `app.js`: that directive is sent only when the site really is HTTPS (own TLS, `PUBLIC_ORIGIN=https://…`, or `BEHIND_HTTPS_PROXY=1` behind Caddy). Safari/WebKit now renders. |
| 3 | Unit | Not a product defect: four unit-test expectations were wrong (slot length range, template parameters, which pages the General Manager sees). | Tests corrected after checking the rules in the SRS. |
| 4 | Earlier smoke run | Accountant menu showed Delivery but the API returns 403; General Manager dashboard called a consultant-only endpoint; quotation LBP total showed "-". | Menu, dashboard and LBP computation fixed (before this session's final runs). |

No open defects remain. Two test-harness mistakes (un-encoded URL, wrong assertion text) were corrected in the tests themselves and are not product defects.

## 2b. UX enhancements added after the first test session (all re-tested)

| Enhancement | Tests |
|---|---|
| Photo gallery with colour swatches; Sales Manager uploads pictures (JPEG/PNG/WebP, magic-byte checked, stored under the backed-up uploads folder) | backend `FR-CAT-01 pictures…`, component `Gallery`, system SYS-UI-UX-04/05 |
| Home "find your car" panel; catalogue filters kept in the address; budget slider, sort, result count, "fixed price" note | system SYS-UI-UX-01/02/03 |
| Test-drive booking: nearest free slot pre-selected, one tap to book, "choose another time" still available | system SYS-UI-TD-01/02, SYS-UI-USA-03 |
| Deals pipeline board and a highlighted "next step" on every deal | component `Board`, `NextStep`, system SYS-UI-UX-06/07 |

### Batch 2 (tables, dashboard, errors, account home, PDFs, Arabic, accessibility, speed)

| Enhancement | Tests |
|---|---|
| Tables: sticky header, click-to-sort, search box (more than 8 rows), card layout on phones, friendly empty state | component `Table`, system SYS-UI-TBL-01, SYS-UI-USA-04 (no overflow 360–1920 px) |
| Consultant dashboard "needs attention today" (quotes about to expire, licences missing, contracts to sign, follow-ups, pending exceptions for managers) | backend `FR-DEAL-02 attention`, component `Attention`, system SYS-UI-UX-08 |
| Friendly, translated error messages (EN/AR) for known error codes and for a lost connection | unit `errMsg` |
| Customer account home: current order, next step, progress bar, contact button (opens the chat) | component `NextStepCard`, system SYS-UI-UX-10/10b |
| Branded PDFs: logo mark, company details, VAT line and page numbers on contract, receipt, invoice, loan and handover documents (company details configurable with COMPANY_* environment variables) | existing PDF unit and module tests; page checked visually |
| Arabic: wider line spacing and Arabic font stack; optional Arabic-Indic digits (٠١٢٣) | unit digits test, system SYS-UI-LANG-04 |
| Accessibility: skip link, main landmark, visible focus ring, reduced-motion support, higher-contrast grey text, labelled date field; automated WCAG 2 A/AA scan (axe-core) of 8 key pages | system SYS-UI-A11Y-01/02 (the scan found two real issues, both fixed) |
| Speed: staff console and customer account loaded only when needed, reports (charts) loaded separately. Public site script 875 KB → 368 KB (118 KB compressed) | build output |

Not done by a machine: native-speaker review of the Arabic wording, dark mode (left out on purpose).

### Batch 3 (showroom redesign)

| Change | Tests |
|---|---|
| The site address opens a sign-in page (split screen, show/hide password, clear errors, "Continue as guest", create account); signed-in users skip it | system SYS-UI-LAND-01…04 |
| Public pages in a dark showroom theme: transparent header over a full-screen animated hero (light streaks, optional video at `frontend/public/media/hero.mp4`), hamburger menu on phones, outlined buttons that fill on hover, cards that lift and zoom on hover, scroll reveal animations (reduced-motion respected), footer with links and address | system SYS-UI-LAND-05, SYS-UI-ANIM-01, A11Y-02 (contrast re-checked), USA-04 (no overflow; the scan found a sideways-slide overflow on phones, fixed) |
| New logo (redesign of the team's logo from the Phase III document: car roofline over a three-bar "stack", gradient tile, italic wordmark). Shown only in the header, the sign-in page, the footer, the browser tab icon and the PDF header | visual check; all suites re-run |
| Staff console and customer account stay light for long working sessions | system SYS-UI-ROLE-01, PORTAL-01 |


Columns: **Unit** = number of unit tests naming the requirement; **Component** = module/component tests naming it; **System** = black-box browser/security/performance checks naming it. Every backend module test additionally runs over HTTP in the system run ("Over HTTP = yes").

| Requirement | Summary | Unit | Component | Over HTTP | System | Note |
|---|---|---|---|---|---|---|
| FR-ACC-01 | The system shall let a visitor register with an email address and a password. | 0 | 2 | yes | 0 |  |
| FR-ACC-02 | The system shall ask for the customer's consent to data processing, and separately to mark | 0 | 1 | yes | 0 |  |
| FR-ACC-03 | The system shall let a customer view and edit their profile and see their enquiries, appoi | 0 | 2 | yes | 0 |  |
| FR-ACC-04 | The system shall let a customer request a copy or the erasure of their personal data, and  | 0 | 1 | yes | 0 |  |
| FR-ACC-05 | The system shall let every user choose Arabic or English at any time, shall remember the c | 1 | 1 | yes | 0 |  |
| FR-ADM-01 | The system shall provide role-based access with these roles: Customer, Sales Consultant, S | 0 | 2 | yes | 0 |  |
| FR-ADM-02 | The system shall let the Administrator create and deactivate users and assign roles; a dea | 0 | 1 | yes | 0 |  |
| FR-ADM-03 | The system shall let the Administrator set the VAT rate, the stamp duty rule, the exchange | 0 | 1 | yes | 0 |  |
| FR-ADM-04 | The system shall keep an audit log of logins, price changes, payments, refunds, role chang | 0 | 2 | yes | 0 |  |
| FR-CAT-01 | The system shall display a public catalogue of all models and trims on sale, with photos,  | 0 | 1 | yes | 0 |  |
| FR-CAT-02 | The system shall let visitors filter the catalogue by brand, body type, fuel type and pric | 0 | 1 | yes | 0 |  |
| FR-CAT-03 | The system shall show, for each trim, one final price in USD with its LBP equivalent at th | 0 | 2 | yes | 0 |  |
| FR-CAT-04 | The system shall show each trim as In stock (with the count), In transit (with the expecte | 0 | 2 | yes | 0 |  |
| FR-CAT-05 | The system shall let a visitor select up to three trims and view their specifications and  | 0 | 2 | yes | 0 |  |
| FR-CAT-06 | The system shall calculate a monthly instalment from the price, down payment, term and an  | 1 | 1 | yes | 0 |  |
| FR-CAT-07 | The system shall compare the yearly running cost of a hybrid or electric trim with a chose | 1 | 1 | yes | 0 |  |
| FR-CAT-08 | The system shall allow only the Sales Manager to publish prices and promotions, and shall  | 0 | 2 | yes | 0 |  |
| FR-DEAL-01 | The system shall create a lead for every enquiry from the website form, chat, test-drive b | 0 | 2 | yes | 0 |  |
| FR-DEAL-02 | The system shall show each consultant a dashboard of their leads and today's appointments. | 0 | 1 | yes | 0 |  |
| FR-DEAL-03 | The system shall generate a quotation from the catalogue showing the trim, colour, accesso | 0 | 2 | yes | 0 |  |
| FR-DEAL-04 | The system shall allow a consultant to add accessories only at catalogue prices; any other | 0 | 1 | yes | 0 |  |
| FR-DEAL-05 | The system shall move each deal through the stages Lead, Quoted, Reserved, Contract signed | 1 | 2 | yes | 0 |  |
| FR-DEAL-06 | The system shall generate a numbered purchase contract in PDF from the deal data, includin | 0 | 1 | yes | 0 |  |
| FR-DEAL-07 | The system shall let the customer sign the contract on screen in their account, or on pape | 0 | 2 | yes | 0 |  |
| FR-DEAL-08 | The system shall let the Sales Manager approve or reject exception requests and shall reco | 0 | 2 | yes | 0 |  |
| FR-DEL-01 | The system shall give the Delivery Coordinator a pre-delivery inspection checklist for eac | 0 | 1 | yes | 0 |  |
| FR-DEL-02 | The system shall not allow a deal to be delivered until every inspection item has passed a | 0 | 2 | yes | 0 |  |
| FR-DEL-03 | The system shall let the customer choose from the available delivery slots and shall send  | 0 | 1 | yes | 0 |  |
| FR-DEL-04 | The system shall list the documents needed for registration (for example invoice, identity | 0 | 1 | yes | 0 |  |
| FR-DEL-05 | The system shall produce a handover form listing the car, accessories and keys, and when t | 1 | 1 | yes | 0 |  |
| FR-DEL-06 | The system shall show the customer a progress timeline: Reserved, Contract signed, Paid, C | 0 | 1 | yes | 0 |  |
| FR-EV-01 | The system shall provide an EV Readiness Check that asks for daily distance, parking type, | 1 | 2 | yes | 0 |  |
| FR-EV-02 | The system shall return a result of Suitable, Needs attention or Not recommended, with the | 0 | 1 | yes | 0 |  |
| FR-EV-03 | The system shall let the customer send the result to a consultant or book a test drive dir | 0 | 1 | yes | 0 |  |
| FR-INV-01 | The system shall keep one record per physical car, identified by its VIN, with model, trim | 0 | 1 | yes | 0 |  |
| FR-INV-02 | The system shall let the Sales Manager import price, stock and shipment files in CSV forma | 0 | 1 | yes | 0 |  |
| FR-INV-03 | The system shall reserve a car exclusively when a deposit is recorded and shall refuse any | 0 | 2 | yes | 0 |  |
| FR-INV-04 | The system shall allow a deposit on an in-transit or order-only car and shall allocate the | 0 | 1 | yes | 0 |  |
| FR-INV-05 | The system shall release a reservation when the deal is marked Lost or the deposit is refu | 0 | 1 | yes | 0 |  |
| FR-INV-06 | The system shall alert the Sales Manager when the stock of a trim falls below the threshol | 0 | 1 | yes | 0 |  |
| FR-NOT-01 | The system shall send notifications by WhatsApp or email, according to each customer's sta | 1 | 1 | yes | 0 |  |
| FR-NOT-02 | The system shall let a customer opt out of marketing messages without stopping transaction | 0 | 1 | yes | 0 |  |
| FR-OC-01 | The system shall create a membership automatically when a deal is Delivered and shall issu | 0 | 1 | yes | 0 |  |
| FR-OC-02 | The system shall give each member a unique referral code and link. | 0 | 1 | yes | 0 |  |
| FR-OC-03 | The system shall link a new lead to a referrer when the referral code is entered before th | 0 | 1 | yes | 0 |  |
| FR-OC-04 | The system shall add a credit to the referrer when the referred deal is Delivered, using t | 0 | 1 | yes | 0 |  |
| FR-OC-05 | The system shall show members their credit balance and referrals, shall let them use the c | 0 | 1 | yes | 0 |  |
| FR-OC-06 | The system shall let the Sales Manager publish an owners' event or an early-access offer f | 0 | 1 | yes | 0 |  |
| FR-PAY-01 | The system shall record each deposit or payment in USD or LBP with its method (cash, bank  | 0 | 2 | yes | 0 |  |
| FR-PAY-02 | The system shall hold the quotation price for a car with a deposit for the period stated i | 0 | 2 | yes | 0 |  |
| FR-PAY-03 | The system shall issue a receipt for each payment with a sequential number and shall send  | 1 | 1 | yes | 0 |  |
| FR-PAY-04 | The system shall let the Accountant record a refund linked to the original payment, with a | 0 | 3 | yes | 0 |  |
| FR-PAY-05 | The system shall issue an invoice that shows VAT separately, using the VAT rate set by the | 1 | 1 | yes | 0 |  |
| FR-PAY-06 | The system shall let the consultant produce a loan request summary (customer details, quot | 0 | 1 | yes | 0 |  |
| FR-PAY-07 | The system shall export invoices and payments as CSV for the dealership's accounting softw | 0 | 1 | yes | 0 |  |
| FR-PAY-08 | The system shall let the Sales Manager record the cancellation of a reserved deal and shal | 0 | 2 | yes | 0 |  |
| FR-REP-01 | The system shall give the General Manager a dashboard of cars sold and revenue by period,  | 0 | 1 | yes | 0 |  |
| FR-REP-02 | The system shall give the Sales Manager each consultant's leads, test drives, deals and co | 0 | 1 | yes | 0 |  |
| FR-REP-03 | The system shall report stock by status and the age of every unsold car. | 0 | 1 | yes | 0 |  |
| FR-REP-04 | The system shall report virtual-assistant chats, hand-offs and chats resolved without a pe | 0 | 1 | yes | 0 |  |
| FR-REP-05 | The system shall report Owners Circle members, referrals, credits issued and the share of  | 0 | 1 | yes | 0 |  |
| FR-TD-01 | The system shall let a customer choose a trim available for test drive, a date and a free  | 0 | 4 | yes | 0 |  |
| FR-TD-02 | The system shall require a scan of the customer's valid driving license before the drive a | 0 | 1 | yes | 0 |  |
| FR-TD-03 | The system shall let a customer reschedule or cancel a booking before the slot and shall f | 0 | 2 | yes | 0 |  |
| FR-TD-04 | The system shall send a confirmation when a slot is booked and a reminder the day before. | 0 | 1 | yes | 0 |  |
| FR-TD-05 | The system shall give the consultant a checklist for each drive: license verified, battery | 0 | 1 | yes | 0 |  |
| FR-VA-01 | The system shall offer a chat assistant on public pages, 24 hours a day, in Arabic and Eng | 0 | 1 | yes | 0 |  |
| FR-VA-02 | The assistant shall answer questions about models, prices, availability and test-drive slo | 0 | 1 | yes | 0 |  |
| FR-VA-03 | The assistant shall hand the chat to a consultant when the user asks, or when it cannot an | 0 | 1 | yes | 0 |  |
| FR-VA-04 | The assistant shall let the user book a test drive inside the chat. | 0 | 1 | yes | 0 |  |
| NFR-CMP-01 | The system shall work in the latest two versions of Chrome, Edge, Firefox and Safari, and  | 0 | 0 | - | 4 | manual |
| NFR-DAT-01 | Personal data shall be collected only with recorded consent and shall be exported or erase | 0 | 1 | yes | 0 |  |
| NFR-LOC-01 | Prices shall be shown in USD with the LBP equivalent, and dates as day/month/year. | 3 | 1 | yes | 1 |  |
| NFR-MNT-01 | VAT rate, exchange rate and referral credit shall be changed through settings with no chan | 1 | 1 | yes | 0 |  |
| NFR-PERF-01 | At least 95% of catalogue page requests shall complete within 3 seconds with 50 concurrent | 0 | 1 | yes | 1 |  |
| NFR-REL-01 | Data shall be backed up automatically every day; after a failure the system shall be resto | 0 | 1 | yes | 2 |  |
| NFR-SEC-01 | All data between browser and system shall be encrypted with TLS 1.2 or higher. | 0 | 1 | yes | 1 |  |
| NFR-SEC-02 | Passwords shall be at least 8 characters long and stored only as salted hashes. | 1 | 1 | yes | 2 |  |
| NFR-SEC-03 | Staff sessions shall end after 15 minutes of inactivity, and an account shall lock for 15  | 2 | 2 | yes | 1 |  |
| NFR-SEC-04 | Uploaded personal documents (license, identity copy) shall be stored encrypted and be visi | 1 | 1 | yes | 2 |  |
| NFR-SEC-05 | A security check before each release shall find no high-severity issue from the OWASP Top  | 0 | 2 | yes | 1 |  |
| NFR-USA-01 | The whole interface shall be available in Arabic (right to left) and English and shall swi | 0 | 0 | - | 2 | manual |
| NFR-USA-02 | After 2 hours of training, a new sales consultant shall complete the workflow lead, quotat | 0 | 0 | - | 1 | manual |
| NFR-USA-03 | At least 80% of test customers shall book a test drive in 3 minutes or less without help. | 0 | 0 | - | 1 | manual |
| NFR-USA-04 | Pages shall display correctly on screen widths from 360 to 1920 pixels. | 0 | 0 | - | 1 | manual |

### Batch 4 (demo features F1-F6)

| Feature | Tests |
|---|---|
| F1 Budget-first finder (monthly slider; loan term, down payment and interest are staff settings) | backend `catalogue.test.js` (finder config, manager change, validation); frontend unit (payment formula equals the backend); system SYS-UI-FEAT-01 |
| F2 EV savings calculator (staff-set fuel and electricity prices) | backend `features.test.js` (series, price change, input errors, break-even rules); system SYS-UI-FEAT-02 |
| F3 Price history and "price locked" badge | backend (public trend follows price changes, 404); system SYS-UI-FEAT-03 |
| F4 Trade-in estimate and confirmed offer | backend (formula ordering, validation, lead creation, offer validity and expiry, notification, offer only after a request); system SYS-UI-FEAT-04 and 08 |
| F5 QR test-drive pass and staff check-in | backend (check-in once, today only, active bookings only, role); component tests (QR image, check-in messages); system SYS-UI-FEAT-05 and 06 |
| F6 Smart order tracker (estimate, steps, readiness, one notification per stage) | backend (steps, privacy, notification, estimate rules); component tests; system SYS-UI-FEAT-07 |

### Batch 5 (deep debugging session: static analysis, code review, unit, component, system and scenario testing)
Method: ESLint static pass; manual review of security-sensitive code; a route sweep (`backend/tests/robustness.test.js`) that enumerates every real Express route and sends 32,488 hostile requests (wrong types, objects, arrays, booleans, huge values, every role) asserting no 5xx and no leaked SQL/stack text; scenario tests (`backend/tests/debug-session.test.js`) for IDOR between customers, forged tokens and bad types.

| # | Defect found | Fix | Regression test |
|---|---|---|---|
| D1 | Open redirect: `/login?next=//evil.com` | `safeNext()` only accepts same-site paths | utils-api unit (9 cases) |
| D2 | Anonymous trade-in quick estimates stored without limit | Stored only when a contact is requested or user is signed in | features + debug-session |
| D3 | Unknown `trim_id` in trade-in created a deal then failed with 500 | Validated first, 404 | debug-session |
| D4 | A failed notification could block a deal stage change | Notification errors are contained | covered by stage tests |
| D5 | Tracker showed a made-up "ready" date | Only real dates shown | features |
| D6 | Finder slider flickered before config loaded | Budget is 0 until config arrives | component |
| D7 | 24 HTTP 500s on object/array/boolean field values (promotions, accessories, leads, deal edit, mark lost, payments, password reset) | Central mapping of driver type errors to 400 `invalid_input`, plus explicit text checks | robustness sweep (now 0 server errors) + debug-session |
| D8 | Download file names could contain unsafe characters | Stricter sanitising | system suite |

Result after fixes: 185/185 backend, 79/79 frontend, 111/111 over HTTP, 76/76 system, i18n 821 = 821.

## 4. System checks (76)

| ID | Check | Result |
|---|---|---|
| SYS-SEC-HDR | Security headers present, no X-Powered-By (OWASP A05) | PASS |
| SYS-WEB-01 | Built web application is served from the same server (SPA index) | PASS |
| SYS-WEB-02 | Deep links fall back to the SPA | PASS |
| SYS-SEC-INJ | SQL injection strings in login and filters do not bypass or break anything | PASS |
| SYS-SEC-AUTHN | Protected endpoints reject anonymous callers with 401 | PASS |
| SYS-SEC-AUTHZ | Roles cannot call endpoints of other roles (customer/consultant/manager vs admin) | PASS |
| SYS-SEC-IDOR | A customer cannot read another customer's deal / documents | PASS |
| SYS-SEC-JWT | Tampered or garbage tokens are rejected | PASS |
| SYS-SEC-LOCK | Account locks after 5 failed attempts even for the right password (NFR-SEC-03) | PASS |
| SYS-SEC-ERR | Unknown routes / malformed input return clean errors with no stack traces | PASS |
| SYS-SEC-PW | A password shorter than 8 characters is refused at registration (NFR-SEC-02) | PASS |
| SYS-SEC-HASH | Every stored password is a salted bcrypt hash, none in plain text (NFR-SEC-02) | PASS |
| SYS-SEC-ENC | Any file in the upload folder is encrypted (no readable PDF/JPEG header) (NFR-SEC-04) | PASS |
| SYS-PERF-01 | 50 concurrent users x 10 requests on catalogue pages, 95% under 3 s (NFR-PERF-01) | PASS |
| SYS-PERF-02 | Stress: 200 concurrent users, no failed request, p95 still under 3 s | PASS |
| SYS-TLS | HTTPS accepts TLS 1.2 and 1.3 and refuses TLS 1.0/1.1 (NFR-SEC-01) | PASS |
| SYS-TLS-API | API fully functional over HTTPS | PASS |
| SYS-UI-CAT-01 | Catalogue page lists car cards (TC-CAT-01) | PASS |
| SYS-UI-CAT-02 | Cards show USD price and LBP equivalent (TC-CAT-03, NFR-LOC-01) | PASS |
| SYS-UI-CAT-03 | Fuel filter narrows the list (TC-CAT-02) | PASS |
| SYS-UI-CAT-04 | Trim page shows price, stock status, inclusions and calculators (TC-CAT-03/04/06/07) | PASS |
| SYS-UI-CAT-05 | Compare page shows exactly three trims side by side and the 4th is blocked (TC-CAT-05) | PASS |
| SYS-UI-LANG-01 | Switching to Arabic flips the page to RTL immediately with Arabic text, no reload (TC-ACC-05, NFR-USA-01) | PASS |
| SYS-UI-LANG-02 | Switching back restores LTR English | PASS |
| SYS-UI-VA-01 | Chat assistant answers a catalogue question (TC-VA-01/02) | PASS |
| SYS-UI-VA-02 | Chat answers a rule-base question (fixed prices, no negotiation) (TC-VA-02) | PASS |
| SYS-UI-VA-03 | Hand-off asks for contact details to create a lead (TC-VA-03) | PASS |
| SYS-UI-VA-04 | The chat hand-off created a lead with source "assistant" visible to staff (TC-DEAL-01/VA-03) | PASS |
| SYS-UI-EV-01 | EV readiness check returns a verdict with reasons (TC-EV-01/02) | PASS |
| SYS-UI-ACC-01 | A new customer can register with consent and lands logged in (TC-ACC-01/02) | PASS |
| SYS-UI-TD-01 | Customer books a test drive end to end in the browser and gets a confirmation (TC-TD-01/04) | PASS |
| SYS-UI-USA-03 | Booking from the trim page needs only consent + Book for a signed-in customer (slot pre-selected), under 3 minutes (NFR-USA-03, proxy for human test) | PASS |
| SYS-UI-TD-02 | The visitor can still choose another date and time (TC-TD-01) | PASS |
| SYS-UI-UX-01 | Home "find your car" opens the catalogue pre-filtered; the filters live in the address and survive a reload | PASS |
| SYS-UI-UX-02 | The budget slider narrows the list and updates the address | PASS |
| SYS-UI-UX-03 | Cards state that the price is fixed and show the availability | PASS |
| SYS-UI-UX-04 | Colour swatches on the trim page switch the selected colour | PASS |
| SYS-UI-UX-05 | A photo uploaded by the Sales Manager is stored, served publicly and replaces the illustration on the card (FR-CAT-01) | PASS |
| SYS-UI-UX-06 | Consultant sees the pipeline board with one column per stage and the cards of the real deals | PASS |
| SYS-UI-UX-07 | A deal page shows one highlighted next step with its action button (reserved deal: create the contract) | PASS |
| SYS-UI-DEAL-01 | Consultant completes lead → quotation → deposit → contract in the browser (TC-DEAL-01/03/06, TC-PAY-01) (NFR-USA-02 proxy) | PASS |
| SYS-UI-ROLE-01 | 35 staff pages across 6 roles render with no error banner and no untranslated keys (TC-ADM-01, all) | PASS |
| SYS-UI-ROLE-02 | A consultant opening /staff/users sees no user list (forbidden / redirect) (TC-ADM-01) | PASS |
| SYS-UI-PORTAL-01 | Customer portal pages (deals, profile, privacy, Owners Circle) render (TC-ACC-03/04, TC-OC-01) | PASS |
| SYS-SEC-XSS | Script/HTML in a customer name is shown as text, never executed (OWASP A03/XSS) | PASS |
| SYS-UI-LANG-03 | Public pages in Arabic are RTL with no untranslated keys (NFR-USA-01) | PASS |
| SYS-UI-USA-04 | No horizontal page overflow at 360, 412, 768, 1024, 1280, 1920 px on public and staff pages (NFR-USA-04) | PASS |
| SYS-UI-MOB-01 | Android (Pixel 7 emulation) renders catalogue (NFR-CMP-01 partial) | PASS |
| SYS-UI-MOB-02 | iPhone 14 viewport emulation renders catalogue (NFR-CMP-01 partial) | PASS |
| SYS-CMP-FIREFOX | firefox renders the catalogue (NFR-CMP-01) | PASS |
| SYS-CMP-WEBKIT | webkit renders the catalogue (NFR-CMP-01) | PASS |
| SYS-UI-ERR | No uncaught JavaScript errors in any browser journey | PASS |
| SYS-REL-01 | A backup file is produced (manual trigger via admin API; daily timer is also started at boot) (NFR-REL-01) | PASS |
| SYS-REL-02 | First start created an automatic backup without any request | PASS |
| SYS-REL-03 | Restore script brings the database back to the backed-up state (data loss < 24 h) (NFR-REL-01) | PASS |

Performance (NFR-PERF-01): see the SYS-PERF rows; the load test is `npm run loadtest` (50 users) and a 200-user stress run passed the same 3-second limit.

## 5. What a machine cannot prove (manual, see `docs/MANUAL-CHECKS.md`)

| Requirement | Why manual | State |
|---|---|---|
| NFR-USA-02 | Needs a new consultant after 2 hours of training. | The full lead → quotation → deposit → contract flow runs in the browser in about 7 seconds of machine time with no dead ends (SYS-UI-DEAL-01). Human timing still to be recorded. |
| NFR-USA-03 | Needs at least 80% of real test customers to book in 3 minutes. | Booking works end to end in the browser (SYS-UI-TD-01). Human timing still to be recorded. |
| NFR-CMP-01 | Needs the latest Edge, Safari and real Android/iOS devices. | Chromium, Firefox and WebKit engines, plus Pixel 7 and iPhone 14 emulation, pass. Edge uses the Chromium engine. Real devices still to be checked. |
| NFR-SEC-05 | An independent security review before release. | Automated OWASP checks pass (headers, injection, access control, broken authentication, XSS, error leakage); a reviewer sign-off is still to be done. |

## 6. Known limits of this test session

- Tests ran on one machine with a simulated clock for time-based rules (7-day quotation validity, reminders, 90-day stock age, 15-minute sessions); a real overnight run of the scheduled jobs was not done.
- The notification channel is the simulated outbox chosen for this project; real SMS/WhatsApp/email delivery was not tested.
- TLS was tested with a self-signed certificate on the Node server; the production certificate on the Caddy proxy should be re-checked with an external scanner after deployment.

## 7. How to reproduce

```
cd backend  && npm test                  # unit + component (163)
cd backend  && npm run test:system       # same module tests over HTTP against a live server per file (96)
cd frontend && npm test                  # frontend unit + component (53)
cd frontend && node scripts/check-i18n.mjs && npm run build
python3 system-tests/system_suite.py     # 68 black-box checks (needs: pip install playwright; playwright install chromium firefox webkit)
```
