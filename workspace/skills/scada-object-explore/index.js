const MAX_LIMIT = 10000;
const DEFAULT_LIMIT = 1000;
const DEFAULT_OFFSET = 0;
const DEFAULT_TIMEZONE = 'UTC';
const DEFAULT_SEARCH_IN = ['.name'];
const MANDATORY_SELECT = ['.fp_path', '.pattern'];

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  'folder',
  'pattern',
  'fields',
  'searchText',
  'searchIn',
  'recursive',
  'select',
  'limit',
  'offset',
]);

const USAGE_HINT =
  'RETRY skill_run with canonical params only. ' +
  'Supported: folder, pattern, fields, searchText, searchIn, recursive, select, limit (max 10000), offset.';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function dedupeStrings(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}

function mergeSelect(select) {
  return dedupeStrings([...select, ...MANDATORY_SELECT]);
}

function rejectUnexpectedKeys(params) {
  const unknownKeys = Object.keys(params).filter((key) => !ALLOWED_TOP_LEVEL_KEYS.has(key));

  if (unknownKeys.length > 0) {
    throw new Error(
      `Unexpected parameter${unknownKeys.length > 1 ? 's' : ''}: ${unknownKeys.join(', ')}. ${USAGE_HINT}`,
    );
  }
}

function normalizeStringArray(value, paramName) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${paramName} must be a non-empty array of field names. ${USAGE_HINT}`);
  }

  const normalized = [];
  const seen = new Set();

  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw new Error(`${paramName} must contain only non-empty strings. ${USAGE_HINT}`);
    }

    const trimmed = entry.trim();
    if (seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function normalizeSelect(select) {
  if (select === undefined) {
    return [];
  }

  return normalizeStringArray(select, 'select');
}

function normalizeLimit(limit) {
  if (limit === undefined) {
    return { value: DEFAULT_LIMIT };
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`limit must be a positive integer. ${USAGE_HINT}`);
  }

  if (limit > MAX_LIMIT) {
    return {
      value: MAX_LIMIT,
      clampedFrom: limit,
    };
  }

  return { value: limit };
}

function normalizeOffset(offset) {
  if (offset === undefined) {
    return DEFAULT_OFFSET;
  }

  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error(`offset must be a non-negative integer. ${USAGE_HINT}`);
  }

  return offset;
}

function normalizeRecursive(recursive) {
  if (recursive === undefined) {
    return true;
  }

  if (typeof recursive !== 'boolean') {
    throw new Error(`recursive must be boolean. ${USAGE_HINT}`);
  }

  return recursive;
}

function normalizeTextSearch(params) {
  if (params.searchIn !== undefined && params.searchText === undefined) {
    throw new Error(`searchIn requires searchText. ${USAGE_HINT}`);
  }

  if (params.searchText === undefined) {
    return undefined;
  }

  if (typeof params.searchText !== 'string' || params.searchText.trim().length === 0) {
    throw new Error(`searchText must be a non-empty string. ${USAGE_HINT}`);
  }

  const text = params.searchText.trim();
  if (text.length < 3) {
    throw new Error(`searchText must be at least 3 characters. ${USAGE_HINT}`);
  }

  const inFields =
    params.searchIn === undefined
      ? DEFAULT_SEARCH_IN
      : normalizeStringArray(params.searchIn, 'searchIn');

  return {
    text,
    in: inFields,
  };
}

function hasSearchCondition(params, textSearch) {
  return (
    params.folder !== undefined ||
    params.pattern !== undefined ||
    params.fields !== undefined ||
    textSearch !== undefined
  );
}

function validateParams(params) {
  if (!isRecord(params)) {
    throw new Error(`params must be an object. ${USAGE_HINT}`);
  }

  rejectUnexpectedKeys(params);

  const textSearch = normalizeTextSearch(params);
  if (!hasSearchCondition(params, textSearch)) {
    throw new Error(
      `At least one search condition is required: folder, pattern, fields, or searchText. ${USAGE_HINT}`,
    );
  }

  const normalizedLimit = normalizeLimit(params.limit);

  return {
    search: {
      folder: params.folder,
      pattern: params.pattern,
      recursive: normalizeRecursive(params.recursive),
      fields: params.fields,
      search: textSearch,
      select: mergeSelect(normalizeSelect(params.select)),
      limit: normalizedLimit.value,
      offset: normalizeOffset(params.offset),
    },
    limitClampedFrom: normalizedLimit.clampedFrom,
  };
}

function buildScopeSummary(search) {
  if (typeof search.folder === 'string' && search.folder.trim().length > 0) {
    return search.folder.trim();
  }

  if (typeof search.pattern === 'string' && search.pattern.trim().length > 0) {
    return search.pattern.trim();
  }

  if (Array.isArray(search.pattern) && search.pattern.length > 0) {
    return search.pattern.join(', ');
  }

  if (isRecord(search.search) && typeof search.search.text === 'string' && search.search.text.trim()) {
    return `search:${search.search.text.trim()}`;
  }

  return 'object discovery';
}

function createWarning(message, code, severity = 'warning', context) {
  const warning = { severity, message };

  if (code) {
    warning.code = code;
  }

  if (context && Object.keys(context).length > 0) {
    warning.context = context;
  }

  return warning;
}

function typeSummaryFromRows(rows) {
  const summary = {};

  for (const row of rows) {
    const pattern =
      typeof row['.pattern'] === 'string' && row['.pattern'].length > 0
        ? row['.pattern']
        : '(unknown-pattern)';
    summary[pattern] = (summary[pattern] ?? 0) + 1;
  }

  return summary;
}

function metadataFieldsFromRow(row) {
  const fields = {};

  for (const [key, value] of Object.entries(row)) {
    if (key === '.fp_path' || key === '.name' || key === '.pattern') {
      continue;
    }

    fields[key] = value;
  }

  return Object.keys(fields).length > 0 ? fields : undefined;
}

module.exports = async function runScadaObjectExplore({
  client,
  indexRegistry,
  params,
}) {
  const ecometCore = await import('../../libs/ecomet-core/dist/index.js');
  const searchObjects = ecometCore.searchObjects;

  const validated = validateParams(params);
  const producedAt = Date.now();
  const searchResult = await searchObjects(client, indexRegistry, validated.search);
  const returnedRows = Array.isArray(searchResult.objects) ? searchResult.objects : [];
  const warnings = Array.isArray(searchResult.warnings)
    ? searchResult.warnings.map((message) => createWarning(message, 'search_warning'))
    : [];

  if (validated.limitClampedFrom !== undefined) {
    warnings.push(
      createWarning(
        `Requested limit ${validated.limitClampedFrom} exceeds the supported maximum and was clamped to ${MAX_LIMIT}.`,
        'limit_clamped',
        'info',
        { requested: validated.limitClampedFrom, applied: MAX_LIMIT },
      ),
    );
  }

  const objects = [];

  for (const row of returnedRows) {
    const path = typeof row['.fp_path'] === 'string' ? row['.fp_path'] : '';
    if (!path) {
      warnings.push(
        createWarning(
          'Search returned a row without .fp_path; that row was skipped.',
          'missing_fp_path',
        ),
      );
      continue;
    }

    objects.push({
      path,
      name: typeof row['.name'] === 'string' ? row['.name'] : undefined,
      pattern: typeof row['.pattern'] === 'string' ? row['.pattern'] : undefined,
      fields: metadataFieldsFromRow(row),
    });
  }

  const searchTotal = Number.isFinite(searchResult.total) ? searchResult.total : objects.length;
  const searchReturned = objects.length;
  const nextOffset = validated.search.offset + searchReturned;

  let completeness = { status: 'complete' };

  if (searchTotal > searchReturned) {
    completeness = {
      status: 'partial',
      reason: `${searchReturned} of ${searchTotal} matching objects are included in this result page.`,
      total_available: searchTotal,
      total_returned: searchReturned,
      continuation_hint:
        `Continue with offset ${nextOffset} to fetch the next page if you need all matching objects or all current values in this scope.`,
    };
  }

  return {
    kind: 'scope_view',
    blocks: [
      {
        block_kind: 'scope',
        objects,
        total: searchTotal,
        type_summary: typeSummaryFromRows(returnedRows),
      },
    ],
    warnings,
    provenance: {
      source_skill: 'scada-object-explore',
      scope: buildScopeSummary(validated.search),
      period_from: producedAt,
      period_to: producedAt,
      timezone: DEFAULT_TIMEZONE,
      produced_at: producedAt,
    },
    completeness,
    metadata: {
      search_total: searchTotal,
      search_returned: searchReturned,
    },
  };
};
