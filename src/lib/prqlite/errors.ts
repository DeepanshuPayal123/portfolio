export type Stage = "lexer" | "parser" | "analyzer" | "executor";

/** An error raised by one stage of the pipeline; `message` is the exact text the C++ engine prints. */
export class PrqlError extends Error {
  readonly stage: Stage;

  constructor(stage: Stage, message: string) {
    super(message);
    this.name = "PrqlError";
    this.stage = stage;
  }
}
