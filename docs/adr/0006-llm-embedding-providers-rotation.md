# ADR-0006: LLM/embedding providers via rotation (Groq/OpenRouter/Gemini free tiers), never in .env

Status: accepted

## Context

V1 has no LLM budget: generation via Groq/OpenRouter free tiers, embeddings via Gemini. Single-key setups die on 429s; env-stored keys slow down rotation.

## Decision

- Generation: Groq/OpenRouter through the vault rotation (ADR-0003). Embeddings: Gemini through the same vault.
- Provider/model per key is data (DB row), so models can change without code deploys.
- No provider secret in `.env` or frontend bundles, ever.

## Consequences

- Answer path must handle “all keys exhausted” with a graceful busy error + retry guidance.
- Per-student daily quota (30) + response cache bound free-tier spend.
- Moving to paid tiers later = adding rows, not re-architecting.
