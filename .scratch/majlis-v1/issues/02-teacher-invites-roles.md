# 02: Teacher invites + roles

**What to build:** invite-only teacher onboarding with role enforcement, so teachers exist without any public teacher signup.

**Blocked by:** 01 Bootstrap + Identity vertical.

**Status:** ready-for-agent

- [ ] Admin invites a teacher by email (delivered via Mailpit in dev) → teacher activates and sets password
- [ ] Roles admin/teacher/student enforced on every gated action
- [ ] No public teacher self-registration path exists anywhere in UI or API
- [ ] Expired/used invite links are rejected with a clear message
