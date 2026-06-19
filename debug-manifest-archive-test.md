# Debug Session: manifest-archive-test

## Session Info
- **Session ID**: manifest-archive-test
- **Start Time**: 2026-06-19 11:50:00
- **Purpose**: Test the manifest archive/restore system implementation

## Falsifiable Hypotheses

1. **H1**: The archive-manifest Edge Function fails to properly acquire locks, causing concurrent archive operations on the same manifest to proceed simultaneously instead of being blocked.

2. **H2**: The restore-manifest Edge Function fails to properly handle photo uploads during restore, resulting in some photos not being uploaded to the drug-photos bucket after restore operation.

3. **H3**: The archive-cron Edge Function dispatch mechanism fails to properly throttle concurrency, causing more than 5 simultaneous requests to archive-manifest when processing multiple manifests.

4. **H4**: The SSE proxy API routes (`/api/manifest-operation` and `/api/archive-cron`) fail to properly stream responses from Edge Functions, causing the frontend to not receive real-time progress updates.

5. **H5**: The database migration fails to properly set up foreign key constraints in the archive_logs table, causing insert operations to fail when referencing non-existent manifests.

## Instrumentation Plan

The first logical change will be adding instrumentation logs to collect runtime evidence. No business logic modification will be done during Steps 1-4.

## Environment
- OS: Windows
- Project: pharmaCount Web (Next.js + Supabase)
- Testing Focus: Manifest archive/restore functionality

## Status: [OPEN] - Awaiting hypothesis verification through instrumentation