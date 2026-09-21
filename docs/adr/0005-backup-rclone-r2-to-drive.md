# ADR-0005: Backup — scheduled rclone sync R2 → Google Drive

Status: deferred (post-V1)

## Context

The sheikh's recordings are irreplaceable. R2 alone (single account, no versioning story in V1) is not a backup. The circle already keeps a Google Drive archive.

## Decision (deferred)

- No scheduled backup ships in V1. R2 is the sole copy of media bytes until this ADR is re-activated.
- When re-activated: scheduled rclone sync from R2 to the existing Google Drive archive as disaster recovery, plus a backup-status indicator (last success, object counts) and a manual restore runbook.
- Ticket 05 no longer carries backup scope; ticket 13 tracks the deferral.

## Consequences

- V1 accepts single-copy risk on R2; restore story is out of scope until post-V1.
- Re-activation requires rclone remote config + schedule (cron/systemd timer) and Drive credentials handling.

## History

- Was `accepted` with the schedule shipping in ticket 05; moved to `deferred` per scope decision to keep V1 backup-free.
