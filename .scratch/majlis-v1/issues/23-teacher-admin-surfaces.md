# 23: Teacher/admin surfaces — gradebook identity, lesson badge, codes semantics, invite lifecycle

**What to build:** Teachers and admins see trustworthy read surfaces. Gradebook rows use the student's display name (falling back to email), the page names the exam, and the CSV carries the same identity. Pending lessons render a real badge. The codes page is valid list markup. The invite acceptance page names the invited email, and admins can revoke an unused invite, with revoked links rejected using specific Arabic copy.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Gradebook rows show display name with email fallback; the heading includes the exam title; the CSV export includes display name.
- [ ] Lesson status badges cover every backend status; `pending` renders "بانتظار" instead of an empty pill.
- [ ] The codes page empty state uses valid `<ul><li>` markup and axe reports no violations on the page.
- [ ] The invite acceptance page displays the invited email before the form.
- [ ] An admin can revoke an unused invite; revoked and expired links cannot be accepted and explain why in Arabic; used/revoked history stays visible.
- [ ] Backend projection/endpoint tests and frontend rendering tests cover the fallback, badge states, and revoke path.
