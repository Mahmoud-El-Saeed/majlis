# 11: RAG core, no UI

**What to build:** the knowledge pipeline with zero chat UI — index transcripts from Postgres and answer via CLI/curl, quality-graded by a human before any UI work.

**Blocked by:** 03 Course + Lesson library, 10 Key vault + rotation.

**Status:** ready-for-agent

- [ ] Indexing reads transcript_voice/transcript_book TEXT directly from Postgres — explicitly no dependency on ticket 05 or audio files
- [ ] Chunk ~800 tokens / ~150 overlap as CONFIG not constants; one Qdrant collection per course; chunk metadata lesson_id, course_id, pages range, source_type voice|book
- [ ] Retrieval/answer path callable from CLI or curl using Groq/OpenRouter for generation and Gemini for embeddings through the vault
- [ ] Eval script answers 20–30 realistic Arabic questions, logging answer + citations per question
- [ ] Pass condition is a manual human quality grade — ticket 12 must not start until it passes
