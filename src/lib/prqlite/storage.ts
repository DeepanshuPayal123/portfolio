import type { ColumnDef, ColumnType } from "@/lib/prqlite/ast";
import { PrqlError } from "@/lib/prqlite/errors";

// Port of PRQLite src/virtual_machine/{memory_manager,table_manager}.cpp: fixed-width tuples in
// 4 KB slotted pages, and a per-table page directory fed by one global page allocator.

export const PAGE_SIZE = 4096;
const HEADER_SIZE = 4; // PageHeader { uint16 slotCount; uint16 freeSpacePointer; }
const SLOT_SIZE = 4; // Slot { uint16 offset; uint16 size; }
export const TEXT_WIDTH = 255;

export type SQLValue = number | boolean | string;

export interface RecordID {
  pageId: number;
  slotId: number;
}

export interface Tuple {
  rid: RecordID;
  data: Uint8Array;
  slotOffset: number;
  slotSize: number;
}

const storageError = (message: string) => new PrqlError("executor", message);

export function columnWidth(type: ColumnType): number {
  if (type === "INT") return 4;
  if (type === "BOOL") return 1;
  return TEXT_WIDTH;
}

export function tupleWidth(columns: ColumnDef[]): number {
  return columns.reduce((width, col) => width + columnWidth(col.type), 0);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeTuple(
  values: SQLValue[],
  columns: ColumnDef[],
): Uint8Array {
  const bytes = new Uint8Array(tupleWidth(columns));
  const view = new DataView(bytes.buffer);
  let offset = 0;
  columns.forEach((col, i) => {
    const value = values[i];
    if (col.type === "INT") view.setInt32(offset, Number(value), true);
    else if (col.type === "BOOL") bytes[offset] = value ? 1 : 0;
    // TEXT copies at most 254 bytes so the field always ends in a null terminator.
    else
      bytes.set(
        encoder.encode(String(value)).subarray(0, TEXT_WIDTH - 1),
        offset,
      );
    offset += columnWidth(col.type);
  });
  return bytes;
}

export function decodeValue(
  bytes: Uint8Array,
  offset: number,
  type: ColumnType,
): SQLValue {
  if (type === "INT")
    return new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getInt32(offset, true);
  if (type === "BOOL") return bytes[offset] !== 0;
  const field = bytes.subarray(offset, offset + TEXT_WIDTH);
  const end = field.indexOf(0);
  return decoder.decode(end === -1 ? field : field.subarray(0, end));
}

export function decodeTuple(
  bytes: Uint8Array,
  columns: ColumnDef[],
): SQLValue[] {
  let offset = 0;
  return columns.map((col) => {
    const value = decodeValue(bytes, offset, col.type);
    offset += columnWidth(col.type);
    return value;
  });
}

export class Page {
  readonly id: number;
  readonly data = new Uint8Array(PAGE_SIZE);
  private readonly view = new DataView(this.data.buffer);
  slotCount = 0;
  freeSpacePointer = PAGE_SIZE;

  constructor(id: number) {
    this.id = id;
    this.writeHeader();
  }

  get headerEnd(): number {
    return HEADER_SIZE + this.slotCount * SLOT_SIZE;
  }

  /** Returns the new slot id, or null when the tuple and its slot don't fit. */
  insertTuple(bytes: Uint8Array): number | null {
    if (bytes.length + SLOT_SIZE > this.freeSpacePointer - this.headerEnd)
      return null;
    this.freeSpacePointer -= bytes.length;
    this.data.set(bytes, this.freeSpacePointer);
    const slotId = this.slotCount++;
    this.setSlot(slotId, this.freeSpacePointer, bytes.length);
    this.writeHeader();
    return slotId;
  }

  deleteTuple(slotId: number): void {
    if (slotId >= this.slotCount)
      throw storageError("DB Error: Invalid Page Access");
    const slot = this.slotAt(slotId);
    if (slot.size === 0 && slot.offset === 0)
      throw storageError("DB Error: Double Deletion of a slot");
    this.setSlot(slotId, 0, 0);
  }

  restoreTuple(tuple: Tuple): void {
    if (tuple.rid.slotId >= this.slotCount)
      throw storageError("DB Error: Invalid Page Restore");
    const slot = this.slotAt(tuple.rid.slotId);
    if (!(slot.size === 0 && slot.offset === 0))
      throw storageError("DB Error: Restore target slot is not deleted");
    this.setSlot(tuple.rid.slotId, tuple.slotOffset, tuple.slotSize);
    this.data.set(tuple.data, tuple.slotOffset);
  }

  getTuple(slotId: number): Tuple {
    if (slotId >= this.slotCount)
      throw storageError("DB Error: Invalid Slot Access");
    const { offset, size } = this.slotAt(slotId);
    if (size === 0 && offset === 0)
      throw storageError("STORAGE Error: Tuple has been deleted");
    return {
      rid: { pageId: this.id, slotId },
      data: this.data.slice(offset, offset + size),
      slotOffset: offset,
      slotSize: size,
    };
  }

  isSlotValid(slotId: number): boolean {
    return slotId < this.slotCount && this.slotAt(slotId).size > 0;
  }

  slots(): { offset: number; size: number }[] {
    return Array.from({ length: this.slotCount }, (_, i) => this.slotAt(i));
  }

  private slotAt(slotId: number) {
    const at = HEADER_SIZE + slotId * SLOT_SIZE;
    return {
      offset: this.view.getUint16(at, true),
      size: this.view.getUint16(at + 2, true),
    };
  }

  private setSlot(slotId: number, offset: number, size: number) {
    const at = HEADER_SIZE + slotId * SLOT_SIZE;
    this.view.setUint16(at, offset, true);
    this.view.setUint16(at + 2, size, true);
  }

  private writeHeader() {
    this.view.setUint16(0, this.slotCount, true);
    this.view.setUint16(2, this.freeSpacePointer, true);
  }
}

/** Catalog::page_count — one counter shared by every table, so pages interleave in the file. */
export class PageAllocator {
  private next = 0;

  allocate(): number {
    return this.next++;
  }
}

export class TableHeap {
  readonly metadataPageId: number;
  /** The page directory: logical page order → physical page. */
  readonly pages: Page[] = [];
  totalTuples = 0;
  private readonly allocator: PageAllocator;

  constructor(allocator: PageAllocator) {
    this.allocator = allocator;
    this.metadataPageId = allocator.allocate();
  }

  /** Append-to-last-page; allocate a fresh page when the last one is full. */
  createTuple(bytes: Uint8Array): RecordID {
    const last = this.pages.at(-1);
    const slot = last?.insertTuple(bytes);
    if (last && slot != null) {
      this.totalTuples++;
      return { pageId: last.id, slotId: slot };
    }

    const page = new Page(this.allocator.allocate());
    const slotId = page.insertTuple(bytes);
    if (slotId === null) throw storageError("DB Error: Can't insert tuple!");
    this.pages.push(page);
    this.totalTuples++;
    return { pageId: page.id, slotId };
  }

  deleteTuple(rid: RecordID): void {
    this.page(rid.pageId).deleteTuple(rid.slotId);
    if (this.totalTuples > 0) {
      this.totalTuples--;
      return;
    }
    throw storageError("Memory Error: Couldn't Update Table Meta Data.");
  }

  restoreTuple(tuple: Tuple): void {
    this.page(tuple.rid.pageId).restoreTuple(tuple);
    this.totalTuples++;
  }

  /** TableIterator: walks the directory lazily, skipping deleted slots. */
  *scan(): Generator<Tuple> {
    for (const page of this.pages) {
      for (let slotId = 0; slotId < page.slotCount; slotId++) {
        if (page.isSlotValid(slotId)) yield page.getTuple(slotId);
      }
    }
  }

  private page(pageId: number): Page {
    const page = this.pages.find((p) => p.id === pageId);
    if (!page) throw storageError("DB Error: Invalid Page Access");
    return page;
  }
}
