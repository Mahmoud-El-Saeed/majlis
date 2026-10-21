# 21: Arabic UX — complete error copy and scoped language direction

**What to build:** Arabic users never see a retry-sounding generic message for a deterministic failure, and the English account-page pilot cannot break the rest of the app. Every backend detail reachable from the UI gets specific Arabic copy; choosing English affects only the account page's direction, while all Arabic-only pages stay RTL and intact across reloads.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Invalid/expired/revoked/exhausted join code, attempts limit, attempt already in progress/submitted, invite expired/used/revoked, exam closed/not opened, and duplicate/blank form input each show specific Arabic copy.
- [ ] A test enumerates every service-raised detail used by the UI and asserts a mapping or an explicit pass-through decision.
- [ ] The generic fallback no longer tells the user to retry when retrying cannot help.
- [ ] Choosing English on the account page does not flip direction or layout on dashboard, course, lesson, exam, or teacher pages; the account page renders LTR in English and RTL in Arabic.
- [ ] The language choice persists across reload with no direction flash; switching back restores RTL everywhere.
- [ ] Playwright covers invalid join, active-attempt conflict, attempts limit, and the language switch at desktop and 390px; a unit test pins the direction scope.
- [ ] If English is instead hidden until full translation, the stored English preference can no longer affect existing pages.
