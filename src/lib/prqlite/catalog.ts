import type { ColumnDef } from "@/lib/prqlite/ast";
import { PrqlError, type Stage } from "@/lib/prqlite/errors";

// Port of PRQLite src/catalog.cpp (name → schema); storage for each table lives in the engine.

export interface TableSchema {
  id: number;
  name: string;
  columns: ColumnDef[];
}

export class Catalog {
  private readonly tables = new Map<string, TableSchema>();
  private nextTableId = 1;

  createTable(name: string, columns: ColumnDef[]): TableSchema {
    if (this.tables.has(name)) {
      throw new PrqlError(
        "executor",
        "SEMANTIC ERROR: two tables with same name attempted to be created.",
      );
    }
    const schema: TableSchema = {
      id: this.nextTableId++,
      name,
      columns: columns.map((c) => ({ ...c })),
    };
    this.tables.set(name, schema);
    return schema;
  }

  /** `stage` is the pipeline stage doing the lookup, so the error is attributed to it. */
  getTable(name: string, stage: Stage): TableSchema {
    const schema = this.tables.get(name);
    if (!schema)
      throw new PrqlError(stage, "SEMANTIC ERROR: This Table Doesn't Exist.");
    return schema;
  }

  list(): TableSchema[] {
    return [...this.tables.values()];
  }
}
