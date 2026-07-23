import { TRPCError } from "@trpc/server";
import { TRASH_REGISTRY, PURGE_ORDER, type TrashEntityType } from "./registry";
import { restoreUser } from "./userCascade";

const TRASH_RETENTION_DAYS = 60;

export interface TrashItem {
  type: TrashEntityType;
  displayName: string;
  id: string;
  label: string;
  deletedAt: Date;
  daysRemaining: number;
}

/** Lists soft-deleted rows across registered entity types, optionally scoped to an org. */
export async function listTrash(organizationId?: string): Promise<TrashItem[]> {
  const results = await Promise.all(
    (Object.keys(TRASH_REGISTRY) as TrashEntityType[]).map(async (type) => {
      const entry = TRASH_REGISTRY[type];
      const where: Record<string, unknown> = { deletedAt: { not: null } };
      if (organizationId) {
        Object.assign(where, entry.orgWhere(organizationId));
      }
      const rows: any[] = await entry.delegate().findMany({
        where,
        ...(entry.include ? { include: entry.include } : {}),
        orderBy: { deletedAt: "desc" },
      });
      return rows.map((row) => {
        const deletedAt: Date = row.deletedAt;
        const msRemaining = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000 - (Date.now() - deletedAt.getTime());
        return {
          type,
          displayName: entry.displayName,
          id: row.id,
          label: entry.label(row),
          deletedAt,
          daysRemaining: Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000))),
        } satisfies TrashItem;
      });
    })
  );
  return results.flat().sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
}

/** Restores a single soft-deleted row. */
export async function restoreEntity(type: TrashEntityType, id: string, organizationId?: string) {
  const entry = TRASH_REGISTRY[type];
  if (!entry) throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown trash entity type: ${type}` });

  const where: Record<string, unknown> = { id, deletedAt: { not: null } };
  if (organizationId) {
    Object.assign(where, entry.orgWhere(organizationId));
  }

  const existing = await entry.delegate().findFirst({ where });
  if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found in trash" });

  if (type === "user") {
    return restoreUser(id);
  }

  return entry.delegate().update({ where: { id }, data: { deletedAt: null } });
}

/** Permanently (hard-)deletes a single soft-deleted row, immediately rather than waiting for the 60-day sweep. */
export async function purgeEntity(type: TrashEntityType, id: string, organizationId?: string) {
  const entry = TRASH_REGISTRY[type];
  if (!entry) throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown trash entity type: ${type}` });

  const where: Record<string, unknown> = { id, deletedAt: { not: null } };
  if (organizationId) {
    Object.assign(where, entry.orgWhere(organizationId));
  }

  const existing = await entry.delegate().findFirst({ where });
  if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found in trash" });

  try {
    await entry.delegate().delete({ where: { id } });
  } catch {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Couldn't permanently delete this item — something still references it. Try again after removing/purging related items.",
    });
  }
}

/** Daily sweep target: hard-deletes anything soft-deleted more than 60 days ago, across all orgs.
 * Processes entity types leaf-to-root (see PURGE_ORDER) and per-row (not per-batch), so one row
 * still blocked by a remaining live FK reference doesn't abort the whole sweep for its model. */
export async function purgeExpired() {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const results: Record<string, { purged: number; skipped: number }> = {};

  for (const type of PURGE_ORDER) {
    const entry = TRASH_REGISTRY[type];
    const due: { id: string }[] = await entry.delegate().findMany({
      where: { deletedAt: { lt: cutoff } },
      select: { id: true },
    });

    let purged = 0;
    let skipped = 0;
    for (const row of due) {
      try {
        await entry.delegate().delete({ where: { id: row.id } });
        purged++;
      } catch {
        skipped++;
      }
    }
    results[type] = { purged, skipped };
  }

  return results;
}
