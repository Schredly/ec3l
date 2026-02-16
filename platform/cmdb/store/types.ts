export type StoreCursor = string;

export type Page<T> = Readonly<{
  items: readonly T[];
  nextCursor?: StoreCursor;
}>;

export type StoreReadOptions = Readonly<{
  limit?: number;
  cursor?: StoreCursor;
}>;

export type StoreWriteOptions = Readonly<{
  expectedVersion?: number;
}>;
