import { describe, expect, test } from "vitest";
import type { ColumnDef } from "@/lib/prqlite/ast";
import { PrqlError } from "@/lib/prqlite/errors";
import {
  PAGE_SIZE,
  Page,
  PageAllocator,
  TableHeap,
  decodeTuple,
  encodeTuple,
  tupleWidth,
} from "@/lib/prqlite/storage";

const users: ColumnDef[] = [
  { name: "id", type: "INT" },
  { name: "name", type: "TEXT" },
  { name: "active", type: "BOOL" },
];
const row = (id: number) => encodeTuple([id, `user${id}`, id % 2 === 0], users);

const storageError = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(PrqlError);
    return (e as PrqlError).message;
  }
  throw new Error("expected a storage error");
};

describe("fixed-width tuples (insert_operator.cpp / utils.hpp)", () => {
  test("INT is 4 bytes, BOOL 1, TEXT always 255 — users(id, name, active) is 260", () => {
    expect(tupleWidth(users)).toBe(260);
    expect(row(1).length).toBe(260);
  });

  test("values round-trip, TEXT is null-padded and truncated to 254 bytes", () => {
    const bytes = encodeTuple([-7, "x".repeat(300), true], users);
    expect(decodeTuple(bytes, users)).toEqual([-7, "x".repeat(254), true]);
    expect(bytes[4 + 254]).toBe(0);
  });
});

describe("slotted page (memory_manager.cpp)", () => {
  test("tuples grow down from the end, slots grow up after the 4-byte header", () => {
    const page = new Page(3);
    expect(page.insertTuple(row(1))).toBe(0);
    expect(page.insertTuple(row(2))).toBe(1);
    expect(page.slots()).toEqual([
      { offset: PAGE_SIZE - 260, size: 260 },
      { offset: PAGE_SIZE - 520, size: 260 },
    ]);
    expect(page.freeSpacePointer).toBe(PAGE_SIZE - 520);
    expect(page.headerEnd).toBe(4 + 2 * 4);
  });

  test("a 4096-byte page holds exactly 15 users rows (264 bytes each incl. slot)", () => {
    const page = new Page(1);
    for (let i = 0; i < 15; i++) expect(page.insertTuple(row(i))).toBe(i);
    expect(page.insertTuple(row(15))).toBeNull();
  });

  test("delete zeroes the slot in O(1) and never reclaims space", () => {
    const page = new Page(1);
    page.insertTuple(row(1));
    page.insertTuple(row(2));
    const before = page.freeSpacePointer;

    page.deleteTuple(0);
    expect(page.slots()[0]).toEqual({ offset: 0, size: 0 });
    expect(page.isSlotValid(0)).toBe(false);
    expect(page.freeSpacePointer).toBe(before);
    expect(page.insertTuple(row(3))).toBe(2);
  });

  test("restore puts a deleted tuple back in its original slot and offset", () => {
    const page = new Page(1);
    page.insertTuple(row(1));
    const tuple = page.getTuple(0);
    page.deleteTuple(0);
    page.restoreTuple(tuple);
    expect(page.slots()[0]).toEqual({ offset: PAGE_SIZE - 260, size: 260 });
    expect(decodeTuple(page.getTuple(0).data, users)[1]).toBe("user1");
  });

  test("exact storage error messages", () => {
    const page = new Page(1);
    page.insertTuple(row(1));
    const tuple = page.getTuple(0);
    expect(storageError(() => page.getTuple(5))).toBe(
      "DB Error: Invalid Slot Access",
    );
    expect(storageError(() => page.deleteTuple(5))).toBe(
      "DB Error: Invalid Page Access",
    );
    expect(storageError(() => page.restoreTuple(tuple))).toBe(
      "DB Error: Restore target slot is not deleted",
    );
    page.deleteTuple(0);
    expect(storageError(() => page.deleteTuple(0))).toBe(
      "DB Error: Double Deletion of a slot",
    );
    expect(storageError(() => page.getTuple(0))).toBe(
      "STORAGE Error: Tuple has been deleted",
    );
  });
});

describe("table heap (table_manager.cpp)", () => {
  test("appends to the last page, then allocates a new one from the global allocator", () => {
    const allocator = new PageAllocator();
    const heap = new TableHeap(allocator);
    expect(heap.metadataPageId).toBe(0);

    const rids = Array.from({ length: 16 }, (_, i) =>
      heap.createTuple(row(i + 1)),
    );
    expect(heap.pages.map((p) => p.id)).toEqual([1, 2]);
    expect(rids[14]).toEqual({ pageId: 1, slotId: 14 });
    expect(rids[15]).toEqual({ pageId: 2, slotId: 0 });
    expect(heap.totalTuples).toBe(16);
  });

  test("tables share the page allocator, so their pages interleave in one file", () => {
    const allocator = new PageAllocator();
    const a = new TableHeap(allocator);
    const b = new TableHeap(allocator);
    a.createTuple(row(1));
    b.createTuple(row(1));
    expect([
      a.metadataPageId,
      b.metadataPageId,
      a.pages[0]!.id,
      b.pages[0]!.id,
    ]).toEqual([0, 1, 2, 3]);
  });

  test("a sequential scan walks the page directory in order and skips deleted slots", () => {
    const heap = new TableHeap(new PageAllocator());
    for (let i = 1; i <= 17; i++) heap.createTuple(row(i));
    heap.deleteTuple({ pageId: 1, slotId: 1 });
    heap.deleteTuple({ pageId: 2, slotId: 0 });

    const ids = [...heap.scan()].map((t) => decodeTuple(t.data, users)[0]);
    expect(ids).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17]);
    expect(heap.totalTuples).toBe(15);
  });

  test("restoreTuple undoes a delete in place", () => {
    const heap = new TableHeap(new PageAllocator());
    heap.createTuple(row(1));
    const [tuple] = [...heap.scan()];
    heap.deleteTuple(tuple!.rid);
    heap.restoreTuple(tuple!);
    expect([...heap.scan()].map((t) => t.rid)).toEqual([
      { pageId: 1, slotId: 0 },
    ]);
    expect(heap.totalTuples).toBe(1);
  });

  test("a row wider than a page cannot be stored", () => {
    const wide: ColumnDef[] = Array.from({ length: 17 }, (_, i) => ({
      name: `c${i}`,
      type: "TEXT" as const,
    }));
    const heap = new TableHeap(new PageAllocator());
    expect(
      storageError(() =>
        heap.createTuple(
          encodeTuple(
            wide.map(() => "x"),
            wide,
          ),
        ),
      ),
    ).toBe("DB Error: Can't insert tuple!");
  });
});
