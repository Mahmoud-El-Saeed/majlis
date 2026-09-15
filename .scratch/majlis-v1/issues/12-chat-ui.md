# 12: Chat UI

**What to build:** the student-facing per-course chatbot over the proven RAG core.

**Blocked by:** 11 RAG core (manual quality gate), 03 Course + Lesson library, 10 Key vault + rotation.

**Status:** ready-for-agent

- [ ] Per-course chat UI showing citations (lesson title + pages) with every grounded answer
- [ ] Arabic-first, sources-only prompting with clear refusal when not explained in lessons
- [ ] 30 queries/day/student quota with response caching
- [ ] Graceful “AI busy, try later” error when all vault keys are exhausted
