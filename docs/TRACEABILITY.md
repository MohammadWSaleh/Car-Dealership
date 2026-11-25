# Requirement traceability matrix

Each requirement of the SRS (Phase III) maps to the code that implements it and to the automated test(s) that prove it. Test names in `backend/tests/` (95 tests) start with the requirement ID, so `npm test -- -t "FR-PAY-04"` runs the tests for one requirement.

| ID | Requirement (short) | Priority | Backend module | Automated test file(s) | # tests |
|---|---|---|---|---|---|
| FR-CAT-01 | The system shall display a public catalogue of all models and trims on sale, with photos, specifications and f… | Must | catalogue.js | catalogue.test.js | 1 |
| FR-CAT-02 | The system shall let visitors filter the catalogue by brand, body type, fuel type and price range. | Must | catalogue.js | catalogue.test.js | 1 |
| FR-CAT-03 | The system shall show, for each trim, one final price in USD with its LBP equivalent at the current exchange r… | Must | catalogue.js | catalogue.test.js | 1 |
| FR-CAT-04 | The system shall show each trim as In stock (with the count), In transit (with the expected arrival date) or O… | Must | catalogue.js | catalogue.test.js | 1 |
| FR-CAT-05 | The system shall let a visitor select up to three trims and view their specifications and prices side by side. | Should | catalogue.js | catalogue.test.js | 1 |
| FR-CAT-06 | The system shall calculate a monthly instalment from the price, down payment, term and an interest rate set by… | Should | catalogue.js | catalogue.test.js | 1 |
| FR-CAT-07 | The system shall compare the yearly running cost of a hybrid or electric trim with a chosen petrol trim, using… | Could | catalogue.js | catalogue.test.js | 1 |
| FR-CAT-08 | The system shall allow only the Sales Manager to publish prices and promotions, and shall not allow a consulta… | Must | catalogue.js | catalogue.test.js | 2 |
| FR-ACC-01 | The system shall let a visitor register with an email address and a password. | Must | accounts.js | accounts.test.js | 1 |
| FR-ACC-02 | The system shall ask for the customer's consent to data processing, and separately to marketing messages, befo… | Must | accounts.js | accounts.test.js | 1 |
| FR-ACC-03 | The system shall let a customer view and edit their profile and see their enquiries, appointments, deposits, c… | Should | accounts.js | accounts.test.js | 1 |
| FR-ACC-04 | The system shall let a customer request a copy or the erasure of their personal data, and shall list the reque… | Must | accounts.js | accounts.test.js | 1 |
| FR-ACC-05 | The system shall let every user choose Arabic or English at any time, shall remember the choice and shall disp… | Must | accounts.js | accounts.test.js | 1 |
| FR-TD-01 | The system shall let a customer choose a trim available for test drive, a date and a free 30-minute slot withi… | Must | testdrives.js | testdrives.test.js | 4 |
| FR-TD-02 | The system shall require a scan of the customer's valid driving license before the drive and shall let the con… | Must | testdrives.js | testdrives.test.js | 1 |
| FR-TD-03 | The system shall let a customer reschedule or cancel a booking before the slot and shall free the slot. | Should | testdrives.js | testdrives.test.js | 2 |
| FR-TD-04 | The system shall send a confirmation when a slot is booked and a reminder the day before. | Should | testdrives.js | testdrives.test.js | 1 |
| FR-TD-05 | The system shall give the consultant a checklist for each drive: license verified, battery charge of at least … | Could | testdrives.js | testdrives.test.js | 1 |
| FR-VA-01 | The system shall offer a chat assistant on public pages, 24 hours a day, in Arabic and English, and the assist… | Should | assistant.js | platform.test.js | 1 |
| FR-VA-02 | The assistant shall answer questions about models, prices, availability and test-drive slots using only data h… | Should | assistant.js | platform.test.js | 1 |
| FR-VA-03 | The assistant shall hand the chat to a consultant when the user asks, or when it cannot answer after two attem… | Should | assistant.js | platform.test.js | 1 |
| FR-VA-04 | The assistant shall let the user book a test drive inside the chat. | Could | assistant.js | platform.test.js | 1 |
| FR-EV-01 | The system shall provide an EV Readiness Check that asks for daily distance, parking type, access to home char… | Should | ev.js | platform.test.js | 1 |
| FR-EV-02 | The system shall return a result of Suitable, Needs attention or Not recommended, with the reasons and a short… | Should | ev.js | platform.test.js | 1 |
| FR-EV-03 | The system shall let the customer send the result to a consultant or book a test drive directly from it. | Could | ev.js | platform.test.js | 1 |
| FR-DEAL-01 | The system shall create a lead for every enquiry from the website form, chat, test-drive booking, walk-in entr… | Must | deals.js | sales.test.js | 2 |
| FR-DEAL-02 | The system shall show each consultant a dashboard of their leads and today's appointments. | Should | deals.js | sales.test.js | 1 |
| FR-DEAL-03 | The system shall generate a quotation from the catalogue showing the trim, colour, accessories at catalogue pr… | Must | deals.js | sales.test.js | 2 |
| FR-DEAL-04 | The system shall allow a consultant to add accessories only at catalogue prices; any other item shall need the… | Must | deals.js | sales.test.js | 1 |
| FR-DEAL-05 | The system shall move each deal through the stages Lead, Quoted, Reserved, Contract signed, Paid, Delivered an… | Must | deals.js | sales.test.js | 2 |
| FR-DEAL-06 | The system shall generate a numbered purchase contract in PDF from the deal data, including the stamp duty lin… | Must | deals.js | sales.test.js | 1 |
| FR-DEAL-07 | The system shall let the customer sign the contract on screen in their account, or on paper in the showroom wi… | Should | deals.js | sales.test.js | 2 |
| FR-DEAL-08 | The system shall let the Sales Manager approve or reject exception requests and shall record the decision and … | Should | deals.js | sales.test.js | 2 |
| FR-PAY-01 | The system shall record each deposit or payment in USD or LBP with its method (cash, bank transfer, cheque or … | Must | payments.js | sales.test.js | 2 |
| FR-PAY-02 | The system shall hold the quotation price for a car with a deposit for the period stated in the contract (defa… | Must | payments.js | sales.test.js | 2 |
| FR-PAY-03 | The system shall issue a receipt for each payment with a sequential number and shall send it to the customer a… | Must | payments.js | sales.test.js | 1 |
| FR-PAY-04 | The system shall let the Accountant record a refund linked to the original payment, with a reason and the Sale… | Should | payments.js | sales.test.js | 3 |
| FR-PAY-05 | The system shall issue an invoice that shows VAT separately, using the VAT rate set by the Administrator (defa… | Must | payments.js | sales.test.js | 1 |
| FR-PAY-06 | The system shall let the consultant produce a loan request summary (customer details, quotation and car detail… | Could | payments.js | sales.test.js | 1 |
| FR-PAY-07 | The system shall export invoices and payments as CSV for the dealership's accounting software. | Should | payments.js | sales.test.js | 1 |
| FR-PAY-08 | The system shall let the Sales Manager record the cancellation of a reserved deal and shall apply the deposit … | Should | payments.js | sales.test.js | 2 |
| FR-INV-01 | The system shall keep one record per physical car, identified by its VIN, with model, trim, color and status (… | Must | inventory.js | operations.test.js | 1 |
| FR-INV-02 | The system shall let the Sales Manager import price, stock and shipment files in CSV format and shall report e… | Must | inventory.js | operations.test.js | 1 |
| FR-INV-03 | The system shall reserve a car exclusively when a deposit is recorded and shall refuse any other reservation o… | Must | inventory.js | operations.test.js | 2 |
| FR-INV-04 | The system shall allow a deposit on an in-transit or order-only car and shall allocate the first matching car … | Should | inventory.js | operations.test.js | 1 |
| FR-INV-05 | The system shall release a reservation when the deal is marked Lost or the deposit is refunded. | Must | inventory.js | operations.test.js | 1 |
| FR-INV-06 | The system shall alert the Sales Manager when the stock of a trim falls below the threshold set by the Adminis… | Should | inventory.js | operations.test.js | 1 |
| FR-DEL-01 | The system shall give the Delivery Coordinator a pre-delivery inspection checklist for each deal with a signed… | Must | delivery.js | operations.test.js | 1 |
| FR-DEL-02 | The system shall not allow a deal to be delivered until every inspection item has passed and either full payme… | Must | delivery.js | operations.test.js | 2 |
| FR-DEL-03 | The system shall let the customer choose from the available delivery slots and shall send a confirmation and a… | Should | delivery.js | operations.test.js | 1 |
| FR-DEL-04 | The system shall list the documents needed for registration (for example invoice, identity copy and insurance)… | Should | delivery.js | operations.test.js | 1 |
| FR-DEL-05 | The system shall produce a handover form listing the car, accessories and keys, and when the signed form is st… | Must | delivery.js | operations.test.js | 1 |
| FR-DEL-06 | The system shall show the customer a progress timeline: Reserved, Contract signed, Paid, Car ready and Deliver… | Should | delivery.js | operations.test.js | 1 |
| FR-OC-01 | The system shall create a membership automatically when a deal is Delivered and shall issue a digital owner ca… | Should | ownerscircle.js | operations.test.js | 1 |
| FR-OC-02 | The system shall give each member a unique referral code and link. | Should | ownerscircle.js | operations.test.js | 1 |
| FR-OC-03 | The system shall link a new lead to a referrer when the referral code is entered before the contract is signed… | Should | ownerscircle.js | operations.test.js | 1 |
| FR-OC-04 | The system shall add a credit to the referrer when the referred deal is Delivered, using the amount set by the… | Should | ownerscircle.js | operations.test.js | 1 |
| FR-OC-05 | The system shall show members their credit balance and referrals, shall let them use the credit on accessories… | Could | ownerscircle.js | operations.test.js | 1 |
| FR-OC-06 | The system shall let the Sales Manager publish an owners' event or an early-access offer for a new model and s… | Could | ownerscircle.js | operations.test.js | 1 |
| FR-NOT-01 | The system shall send notifications by WhatsApp or email, according to each customer's stated preference and i… | Should | services/notify.js | platform.test.js | 1 |
| FR-NOT-02 | The system shall let a customer opt out of marketing messages without stopping transactional messages such as … | Must | services/notify.js | platform.test.js | 1 |
| FR-ADM-01 | The system shall provide role-based access with these roles: Customer, Sales Consultant, Sales Manager, Genera… | Must | admin.js | accounts.test.js | 1 |
| FR-ADM-02 | The system shall let the Administrator create and deactivate users and assign roles; a deactivated user shall … | Must | admin.js | accounts.test.js | 1 |
| FR-ADM-03 | The system shall let the Administrator set the VAT rate, the stamp duty rule, the exchange rate (entered manua… | Must | admin.js | accounts.test.js | 1 |
| FR-ADM-04 | The system shall keep an audit log of logins, price changes, payments, refunds, role changes and data exports … | Should | admin.js | accounts.test.js, sales.test.js | 2 |
| FR-REP-01 | The system shall give the General Manager a dashboard of cars sold and revenue by period, model and fuel type,… | Should | reports.js | platform.test.js | 1 |
| FR-REP-02 | The system shall give the Sales Manager each consultant's leads, test drives, deals and conversion rate. | Should | reports.js | platform.test.js | 1 |
| FR-REP-03 | The system shall report stock by status and the age of every unsold car. | Could | reports.js | platform.test.js | 1 |
| FR-REP-04 | The system shall report virtual-assistant chats, hand-offs and chats resolved without a person. | Could | reports.js | platform.test.js | 1 |
| FR-REP-05 | The system shall report Owners Circle members, referrals, credits issued and the share of sales that come from… | Could | reports.js | platform.test.js | 1 |
| NFR-PERF-01 | At least 95% of catalogue page requests shall complete within 3 seconds with 50 concurrent users. | - | platform (app.js, services/) | platform.test.js | 1 |
| NFR-REL-01 | Data shall be backed up automatically every day; after a failure the system shall be restorable with no more t… | - | platform (app.js, services/) | platform.test.js | 1 |
| NFR-SEC-01 | All data between browser and system shall be encrypted with TLS 1.2 or higher. | - | platform (app.js, services/) | platform.test.js | 1 |
| NFR-SEC-02 | Passwords shall be at least 8 characters long and stored only as salted hashes. | - | platform (app.js, services/) | accounts.test.js | 1 |
| NFR-SEC-03 | Staff sessions shall end after 15 minutes of inactivity, and an account shall lock for 15 minutes after 5 fail… | - | platform (app.js, services/) | accounts.test.js | 2 |
| NFR-SEC-04 | Uploaded personal documents (license, identity copy) shall be stored encrypted and be visible only to authoriz… | - | platform (app.js, services/) | testdrives.test.js | 1 |
| NFR-SEC-05 | A security check before each release shall find no high-severity issue from the OWASP Top 10 list. | - | platform (app.js, services/) | accounts.test.js | 1 |
| NFR-USA-01 | The whole interface shall be available in Arabic (right to left) and English and shall switch language without… | - | platform (app.js, services/) | manual: docs/MANUAL-CHECKS.md (+ frontend/src/__tests__ for language) | check |
| NFR-USA-02 | After 2 hours of training, a new sales consultant shall complete the workflow lead, quotation, deposit with no… | - | platform (app.js, services/) | manual: docs/MANUAL-CHECKS.md (+ frontend/src/__tests__ for language) | check |
| NFR-USA-03 | At least 80% of test customers shall book a test drive in 3 minutes or less without help. | - | platform (app.js, services/) | manual: docs/MANUAL-CHECKS.md (+ frontend/src/__tests__ for language) | check |
| NFR-USA-04 | Pages shall display correctly on screen widths from 360 to 1920 pixels. | - | platform (app.js, services/) | manual: docs/MANUAL-CHECKS.md (+ frontend/src/__tests__ for language) | check |
| NFR-CMP-01 | The system shall work in the latest two versions of Chrome, Edge, Firefox and Safari, and on current Android a… | - | platform (app.js, services/) | manual: docs/MANUAL-CHECKS.md (+ frontend/src/__tests__ for language) | check |
| NFR-MNT-01 | VAT rate, exchange rate and referral credit shall be changed through settings with no change to the software. | - | platform (app.js, services/) | accounts.test.js | 1 |
| NFR-DAT-01 | Personal data shall be collected only with recorded consent and shall be exported or erased on request within … | - | platform (app.js, services/) | platform.test.js | 1 |
| NFR-LOC-01 | Prices shall be shown in USD with the LBP equivalent, and dates as day/month/year. | - | platform (app.js, services/) | platform.test.js | 1 |
