import type { BlockDiffEntry, DocBlock, PendingDiff } from "../types/document";

function serializeBlockBody(b: DocBlock): string {
  const clone: Record<string, unknown> = { ...b };
  delete clone.id;
  return JSON.stringify(clone);
}

export function computeBlockDiff(
  baseBlocks: DocBlock[],
  proposedBlocks: DocBlock[]
): BlockDiffEntry[] {
  const entries: BlockDiffEntry[] = [];
  const baseMap = new Map<string, { idx: number; block: DocBlock }>();
  baseBlocks.forEach((b, idx) => baseMap.set(b.id, { idx, block: b }));

  const matchedBaseIds = new Set<string>();
  let baseCursor = 0;

  for (let pIdx = 0; pIdx < proposedBlocks.length; pIdx++) {
    const nb = proposedBlocks[pIdx];
    const match = baseMap.get(nb.id);

    if (match) {
      // Emit any unmatched base blocks before match.idx as deleted
      while (baseCursor < match.idx) {
        const skipped = baseBlocks[baseCursor];
        if (!matchedBaseIds.has(skipped.id)) {
          matchedBaseIds.add(skipped.id);
          entries.push({
            key: `del-${skipped.id}`,
            kind: "deleted",
            oldBlock: skipped,
          });
        }
        baseCursor++;
      }

      matchedBaseIds.add(nb.id);
      if (baseCursor === match.idx) baseCursor++;

      const changed = serializeBlockBody(match.block) !== serializeBlockBody(nb);
      entries.push({
        key: `${changed ? "mod" : "eq"}-${nb.id}`,
        kind: changed ? "modified" : "unchanged",
        oldBlock: match.block,
        newBlock: nb,
      });
    } else {
      entries.push({
        key: `add-${nb.id}-${pIdx}`,
        kind: "added",
        newBlock: nb,
      });
    }
  }

  // Remaining unmatched base blocks are deleted
  for (const b of baseBlocks) {
    if (!matchedBaseIds.has(b.id)) {
      entries.push({
        key: `del-${b.id}`,
        kind: "deleted",
        oldBlock: b,
      });
    }
  }

  return entries;
}

export function createPendingDiff(
  summary: string,
  baseBlocks: DocBlock[],
  proposedBlocks: DocBlock[]
): PendingDiff {
  return {
    id: `diff-${Date.now()}`,
    summary,
    baseBlocks,
    proposedBlocks,
    entries: computeBlockDiff(baseBlocks, proposedBlocks),
  };
}

export function resolveDiffEntry(
  diff: PendingDiff,
  entryKey: string,
  accept: boolean
): { nextBase: DocBlock[]; remaining: PendingDiff | null } {
  const newEntries: BlockDiffEntry[] = [];
  const nextBlocks: DocBlock[] = [];

  for (const e of diff.entries) {
    if (e.key !== entryKey) {
      newEntries.push(e);
      if (e.oldBlock) nextBlocks.push(e.oldBlock);
      continue;
    }

    if (accept) {
      if (e.kind === "added" && e.newBlock) {
        nextBlocks.push(e.newBlock);
        newEntries.push({
          key: `eq-${e.newBlock.id}`,
          kind: "unchanged",
          oldBlock: e.newBlock,
          newBlock: e.newBlock,
        });
      } else if (e.kind === "modified" && e.newBlock) {
        nextBlocks.push(e.newBlock);
        newEntries.push({
          key: `eq-${e.newBlock.id}`,
          kind: "unchanged",
          oldBlock: e.newBlock,
          newBlock: e.newBlock,
        });
      } else if (e.kind === "deleted") {
        // Accepted deletion: omit from nextBlocks and omit from entries
      }
    } else {
      // Reject change: keep oldBlock if any, drop added block
      if (e.oldBlock) {
        nextBlocks.push(e.oldBlock);
        newEntries.push({
          key: `eq-${e.oldBlock.id}`,
          kind: "unchanged",
          oldBlock: e.oldBlock,
          newBlock: e.oldBlock,
        });
      }
    }
  }

  const stillHasChanges = newEntries.some((e) => e.kind !== "unchanged");
  if (!stillHasChanges) {
    return { nextBase: nextBlocks, remaining: null };
  }

  return {
    nextBase: nextBlocks,
    remaining: {
      ...diff,
      baseBlocks: nextBlocks,
      entries: newEntries,
    },
  };
}
