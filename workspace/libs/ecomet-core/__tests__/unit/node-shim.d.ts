declare module 'assert' {
  interface Assert {
    strictEqual(actual: unknown, expected: unknown, message?: string): void;
    deepStrictEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
    rejects(
      asyncFn: Promise<unknown> | (() => Promise<unknown>),
      error?: (error: unknown) => boolean,
    ): Promise<void>;
  }

  const assert: Assert;
  export default assert;
}

declare const process: {
  exit(code?: number): void;
};
