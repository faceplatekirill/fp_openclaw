export function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

export function dedupePreserveOrder(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
}
