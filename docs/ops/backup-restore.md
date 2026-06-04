# Postgres Backup & Restore (Railway)

Operational runbook for the `simplecargo` Postgres service. Satisfies MVP_PLAN
§0.4 item 10: **backups enabled AND one restore verified before real users.**
An untested backup is not a backup.

- **Project:** `simplecargo` (`9e29a123-2b94-445c-904a-5f3c9e37b95b`)
- **Environment:** `production` (`f96f453a-b070-4d09-8f7b-881f1fad8cc6`)
- **Service:** `Postgres` (`ac8b5894-de18-4046-9a14-ff3963919391`)

Railway backups are **volume snapshots** (incremental, copy-on-write), managed in
the dashboard — there is no API/MCP surface for the schedule or restore, so these
steps are performed by the operator in the Railway UI.

## 1. Enable daily backups

1. Open the Railway project → **Postgres** service → **Settings → Backups** tab.
2. Add a **Daily** schedule. Railway keeps daily snapshots for **6 days**
   (weekly → 1 month, monthly → 3 months; daily is the §0.4 requirement).
3. Optionally trigger one **manual** backup now so a restore can be tested
   immediately (manual backups are capped at 50% of the volume size).

> Pricing: backups are billed only for their incremental size (per-GB/minute),
> same rate as volumes. The Phase-0 DB is tiny (schema + one seeded operator), so
> the cost is negligible.

## 2. Test restore (do this BEFORE real users — while data loss is harmless)

Railway restores a snapshot by **staging a volume swap** in the same project +
environment (it cannot restore into a separate throwaway DB — see Caveats). The
previous volume is retained and merely unmounted, so the operation is reversible.

1. Postgres service → **Backups** tab → locate the snapshot by date stamp.
2. Click **Restore** on that snapshot.
3. Railway stages the change: a **new volume** (named with the snapshot date
   stamp) is mounted at the original mount path; the old volume (e.g.
   `*-volume`) is retained, unmounted.
4. Click **Details** on the project canvas to review the staged change, then
   **Deploy** to apply. The Postgres service redeploys onto the restored volume.

### Verify the restore succeeded

After the redeploy, confirm schema + data came back intact. From a machine with
the **public** connection string (Railway dashboard → Postgres → Connect →
public URL — the `*.railway.internal` URL only resolves inside Railway):

```bash
# expect 15 canonical tables + __drizzle_migrations
psql "$PUBLIC_DATABASE_URL" -c "\dt public.*"
# expect 1 applied migration (matches drizzle/migrations/meta/_journal.json)
psql "$PUBLIC_DATABASE_URL" -c 'select count(*) from public."__drizzle_migrations";'
# expect the seeded operator row
psql "$PUBLIC_DATABASE_URL" -c 'select email, role from "user";'
```

Or hit the running app: **`GET /api/ready`** returns `200 {"status":"ready"}`
only when the applied-migration count matches the build's journal — a green
`/api/ready` after restore is a fast end-to-end confirmation.

## Caveats (from Railway docs)

- Restore is limited to the **same project + environment**; there is no
  side-by-side throwaway clone. The retained old volume is the rollback path.
- Restoring a snapshot **removes newer snapshots** taken after it (older ones
  are kept).
- **Wiping a volume deletes all its backups** — never wipe the prod volume.
- Frontend backup sizes are cached a few hours and may look stale.

## Restore test log

Record each verified restore here (date, snapshot, who, result):

| Date | Snapshot stamp | Operator | Verified (`\dt` / `/api/ready`) |
|------|----------------|----------|----------------------------------|
| _pending — run before first real users_ | | | |
