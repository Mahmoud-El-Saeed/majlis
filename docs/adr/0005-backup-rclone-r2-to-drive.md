# ADR-0005: Backup — scheduled rclone sync R2 → Google Drive

Status: accepted

## Context

The sheikh's recordings are irreplaceable. R2 alone (single account, no versioning story in V1) is not a backup. The circle already keeps a Google Drive archive. Waiting until the end of the build to back up recordings that start landing in R2 mid-build is the exact risk this exists to prevent.

## Decision

- Scheduled rclone sync from R2 to the existing Google Drive archive as disaster recovery.
- The schedule plus a backup-status indicator (last success, object counts) ships with the storage ticket, from the moment recordings land in R2.
- The manual restore runbook ships later with hardening; the schedule may not wait for it.

## Consequences

- Requires rclone remote config + schedule (cron/systemd timer) and Drive credentials handling alongside the storage work.
- Restore is manual in V1 (documented runbook in hardening); automated restore is V2.
