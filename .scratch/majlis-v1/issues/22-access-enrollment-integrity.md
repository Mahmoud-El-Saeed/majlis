# 22: Access, enrollment & operational integrity

**What to build:** The platform identifies clients correctly behind the proxy, gates every non-approved enrollment with a clear status, lets join requests carry the contact details the API already accepts, and closes the operational findings from the audit: public API docs, missing proxy security headers, an order-dependent backend test, and application lint noise.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Rate limiting keys on the real client behind the reverse proxy; exhausting one client's bucket does not rate-limit another. A test reproduces the current shared-bucket behaviour and proves per-client isolation; the Redis fallback still works.
- [ ] Direct course navigation in pending, rejected, or blocked states shows a clear Arabic status page and the correct next step, with no tabs, counts, content, or silent 403s.
- [ ] The dashboard hint matches the real status; blocked does not say it is awaiting review.
- [ ] The join form collects name when the account has none, plus optional phone and note, for new and existing accounts; the teacher pending queue displays all three.
- [ ] The enrollment read returns the course title instead of always null, pinned by a backend test.
- [ ] `/docs` and `/openapi.json` are disabled or protected in production, and the reverse proxy sends baseline security headers; both decisions are documented.
- [ ] The admin-seed test passes on a virgin `majlis_test` database and the full backend suite is order-independent; lint is clean on application code (generated migrations fixed or explicitly excluded).
- [ ] Playwright covers blocked and pending direct navigation and the join form; verification commands are recorded in the ticket comment.
