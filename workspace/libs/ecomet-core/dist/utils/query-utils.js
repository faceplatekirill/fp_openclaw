export function escapeLiteral(value) {
    return value.replace(/'/g, "''");
}
export function dedupePreserveOrder(values) {
    const result = [];
    const seen = new Set();
    for (const value of values) {
        if (!seen.has(value)) {
            seen.add(value);
            result.push(value);
        }
    }
    return result;
}
//# sourceMappingURL=query-utils.js.map