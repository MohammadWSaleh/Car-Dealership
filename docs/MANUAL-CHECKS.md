# Manual checks for requirements that cannot be proven by an automated API test

| ID | How to check | Expected result |
|---|---|---|
| NFR-USA-01 | Open the site, click **العربية** in the header. Repeat on the staff console. | All text switches to Arabic without reload, layout mirrors right-to-left; switching back restores English. Automated part: `frontend` test "Arabic covers every English key" and `node scripts/check-i18n.mjs`. |
| NFR-USA-02 | Give a new consultant the 6-step script in `docs/DEMO.md` (lead → quotation → deposit → contract) after a 2-hour briefing and time them. | Completed without help. Record the result in the project report. |
| NFR-USA-03 | Ask 5–10 people to book a test drive from the home page and time them. | At least 80% finish within 3 minutes unaided. |
| NFR-USA-04 | In Chrome DevTools device toolbar set widths 360, 768, 1280 and 1920 px and open `/`, `/cars`, `/cars/1`, `/staff/deals`. | No horizontal page scroll, no overlapping elements; tables scroll inside their card; the staff menu becomes a horizontal strip on narrow screens. |
| NFR-CMP-01 | Open the demo in the latest two versions of Chrome, Edge, Firefox, Safari and on Android and iOS browsers. | Catalogue, booking and the customer portal work in all. |
