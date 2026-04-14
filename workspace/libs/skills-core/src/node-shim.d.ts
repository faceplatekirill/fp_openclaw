declare module 'node:fs' {
  const fs: {
    existsSync(path: string): boolean;
  };

  export default fs;
}

declare module 'node:path' {
  const path: {
    sep: string;
    resolve(...paths: string[]): string;
    join(...paths: string[]): string;
    relative(from: string, to: string): string;
    isAbsolute(path: string): boolean;
  };

  export default path;
}

declare module 'node:module' {
  interface NodeRequire {
    (id: string): any;
    cache: Record<string, unknown>;
  }

  export function createRequire(filename: string): NodeRequire;
}

declare const process: {
  cwd(): string;
};
