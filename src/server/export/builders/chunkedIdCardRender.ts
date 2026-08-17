import type { Image } from "../../idcard/cardPrimitives";
import { generateIdCardSheetPdf, CARDS_PER_PAGE } from "../../idcard/sheetPdf";
import type { ExportChunkOutcome, ExportPart, ExportProgress } from "../types";

/**
 * Shared by the ID_CARDS and STAFF_ID_CARDS builders — both need the same
 * cursor-paginated, budget-aware, per-item-fault-tolerant render loop, and
 * previously had two independent (and identically bugged) copies.
 *
 * A part never exceeds PART_SIZE_CARDS_MAX rows, so a job whose total is at
 * or under this produces exactly one part in one call and is promoted to a
 * plain single-file artifact by engine.ts's finalizeResumableJob — this is
 * what makes "single PDF for a normal-sized export" fall out of the same
 * mechanism as "many parts for a very large one", rather than being a
 * separate code path. 1200 cards (~150 A4 sheets) was sized from measured
 * render throughput to comfortably finish inside CHUNK_BUDGET_MS
 * (engine.ts) even on a slow instance — see the investigation notes in the
 * plan this shipped from.
 */
const PART_SIZE_CARDS_MAX = 1200;
/** Rows fetched and rendered together before the next deadline check. Small enough that a deadline is never missed by more than one sub-batch's worth of work. */
const SUB_BATCH_SIZE = 40;
/** Kept low deliberately — the bottleneck here is per-card CPU (canvas draw) and one shared, cached logo fetch, not I/O concurrency; a higher number only multiplies peak memory. */
const CONCURRENCY = 3;

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export interface ChunkedIdCardSource<TRow> {
  total: number;
  /** Rows [skip, skip+take), in a stable deterministic order — the same order every call must use, or resumeIndex stops meaning anything. */
  fetchRows(skip: number, take: number): Promise<TRow[]>;
  /** Renders one row. Return null for a row that legitimately can't produce a card (missing tribe/token/etc — skip, not fail). Throwing is caught by the caller and treated the same as returning null, so one malformed row can't take down the whole export. */
  renderRow(row: TRow, logoCache: Map<string, Promise<Image | null>>): Promise<Buffer | null>;
  /** Base name for staged parts — the download route appends "-part-N-of-M" when a job has more than one. */
  fileName: string;
}

export async function buildIdCardChunk<TRow>(
  source: ChunkedIdCardSource<TRow>,
  stagePart: (data: Buffer, meta: { fileName: string; mimeType: string; cardCount: number; sheetCount: number }) => Promise<ExportPart>,
  resumeIndex: number,
  deadline: number,
  onProgress: (p: ExportProgress) => Promise<void>
): Promise<ExportChunkOutcome> {
  if (source.total === 0) {
    const part = await stagePart(await generateIdCardSheetPdf([], "jpeg"), {
      fileName: source.fileName,
      mimeType: "application/pdf",
      cardCount: 0,
      sheetCount: 0,
    });
    return { done: true, resumeIndex: 0, part };
  }

  const logoCache = new Map<string, Promise<Image | null>>();
  const renderedImages: Buffer[] = [];
  let consumed = 0;

  while (resumeIndex + consumed < source.total && renderedImages.length < PART_SIZE_CARDS_MAX) {
    // Always attempt at least one sub-batch, even past the deadline — this is
    // what guarantees every call makes forward progress, so a too-small
    // budget degrades to "slow" rather than "never completes".
    if (consumed > 0 && Date.now() >= deadline) break;

    const take = Math.min(SUB_BATCH_SIZE, PART_SIZE_CARDS_MAX - renderedImages.length, source.total - (resumeIndex + consumed));
    const rows = await source.fetchRows(resumeIndex + consumed, take);
    if (rows.length === 0) break; // total was stale (rows deleted mid-export) — stop rather than loop forever

    const rendered = await mapWithConcurrency(rows, CONCURRENCY, async (row) => {
      try {
        return await source.renderRow(row, logoCache);
      } catch (error) {
        console.error("[export] failed to render one card, skipping it:", error);
        return null;
      }
    });
    for (const image of rendered) if (image) renderedImages.push(image);
    consumed += rows.length;

    await onProgress({ processed: resumeIndex + consumed, total: source.total, stage: "Rendering cards…" });
  }

  // The `total` computed by descriptor.count() before the first call can go
  // stale if rows are deleted mid-export. If a fetch attempt legitimately
  // returns nothing (consumed stayed 0 this call), there is nothing left to
  // do regardless of what `total` claims — treat as done rather than
  // retrying forever with zero progress.
  const done = resumeIndex + consumed >= source.total || consumed === 0;
  const sheetCount = Math.ceil(renderedImages.length / CARDS_PER_PAGE);
  const data = await generateIdCardSheetPdf(renderedImages, "jpeg");
  const part = await stagePart(data, {
    fileName: source.fileName,
    mimeType: "application/pdf",
    cardCount: renderedImages.length,
    sheetCount,
  });

  return { done, resumeIndex: resumeIndex + consumed, part };
}
