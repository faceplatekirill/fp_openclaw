/**
 * Shared param extraction helpers for skills.
 *
 * The agent model often sends flat params (e.g. { object: "...", field: "..." })
 * instead of the expected nested structure (e.g. { tags: [{ object, field }] }).
 * These helpers normalize both shapes so skills don't need to duplicate the logic.
 */
declare const TIME_RANGE_KEYS: Set<string>;
declare const TIME_POINT_KEYS: Set<string>;
declare const TAG_KEYS: Set<string>;
declare const TAG_KEYS_WITH_FUNCTIONS: Set<string>;
/**
 * Reject unexpected top-level keys after normalization.
 *
 * Each skill declares its set of allowed keys (including aliases consumed by
 * the extract* helpers). Any key not in that set triggers an error that names
 * the unknown keys and shows the valid shape.
 *
 * Usage:
 *   rejectUnexpectedKeys(params, [...TAG_KEYS, ...TIME_RANGE_KEYS, 'bucket'], usageHint);
 */
export declare function rejectUnexpectedKeys(params: Record<string, unknown>, allowedKeys: Iterable<string>, usageHint?: string): void;
export { TIME_RANGE_KEYS, TIME_POINT_KEYS, TAG_KEYS, TAG_KEYS_WITH_FUNCTIONS };
export declare function extractTimeRange(params: Record<string, unknown>, usageHint?: string): Record<string, unknown> | undefined;
/**
 * Extract a time-point spec from flat or nested params.
 *
 * Recognized shapes:
 *   - params.time (object)                      → pass through
 *   - params.at / params.timestamp (string)     → { at, timezone? }
 *   - params.at / params.timestamp (number)     → error (reject epoch)
 *   - params.ago (object)                       → { ago, timezone? }
 *
 * Returns undefined when no time-related keys are present.
 */
export declare function extractTimePoint(params: Record<string, unknown>, usageHint?: string): Record<string, unknown> | undefined;
interface ExtractTagsOptions {
    /** Include params.functions in the flat single-tag shorthand (for aggregates). */
    includeFunctions?: boolean;
}
/**
 * Extract a tags array from flat or nested params.
 *
 * Recognized shapes:
 *   - params.tags (array)               → pass through
 *   - params.object + params.field      → wrap into single-element array
 *
 * Returns undefined when neither shape is present.
 */
export declare function extractTags(params: Record<string, unknown>, options?: ExtractTagsOptions): Array<Record<string, unknown>> | undefined;
//# sourceMappingURL=param-helpers.d.ts.map