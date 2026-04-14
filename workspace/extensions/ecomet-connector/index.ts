import {
  EcometClient,
  fieldReadHistory,
  fieldSnapshot,
  fieldAggregates,
  IndexRegistry,
  getPatternIndexes,
  listKnownTypes,
  listFieldsForType,
  getTypeFieldIndexes,
  getAggregates,
  getSnapshot,
  resolveArchives,
  readArchives,
  readObjects,
  searchObjects,
  queryAlarms,
  type AlarmQueryParams,
  type EcometConfig,
} from '../../libs/ecomet-core/dist/index.js';
import { runSkill } from '../../libs/skills-core/dist/index.js';

type ToolParams = {
  action: 'query' | 'query_objects';
  statement?: string;
  timeoutMs?: number;
};

type ReadToolParams = {
  objects: string[];
  fields: string[];
};

type ArchiveReadToolParams = {
  archives: string[];
  from: number;
  to: number;
};

type ArchiveSnapshotToolParams = {
  archives: string[];
  timestamp: number;
};

type ArchiveAggregatesToolParams = {
  aggregates: [string, string][];
  timestamps: number[];
};

type ArchiveResolveToolParams = {
  tags: { object: string; field: string }[];
};

type FieldReadHistoryToolParams = {
  tags: { object: string; field: string }[];
  from: number;
  to: number;
};

type FieldSnapshotToolParams = {
  tags: { object: string; field: string }[];
  timestamp: number;
};

type FieldAggregatesToolParams = {
  tags: { object: string; field: string; functions: string[] }[];
  timestamps: number[];
};

type SearchToolParams = {
  pattern?: string | string[];
  folder?: string;
  recursive?: boolean;
  fields?: Record<string, string | number | boolean>;
  search?: {
    text: string;
    in: string[];
  };
  select: string[];
  limit?: number;
  offset?: number;
};

type AlarmQueryToolParams = AlarmQueryParams;

type IndexesToolParams = {
  pattern: string;
};

type TypesInfoToolParams = '*' | Record<string, '*' | string[]>;

type SkillRunToolParams = {
  skill: string;
  params?: Record<string, unknown>;
  format?: 'json' | 'chat';
};

function readConfig(api: any): EcometConfig {
  const raw = api.config?.plugins?.entries?.['ecomet-connector']?.config ?? {};

  return {
    hosts: Array.isArray(raw.hosts) ? raw.hosts : undefined,
    login: typeof raw.login === 'string' ? raw.login : undefined,
    password: typeof raw.password === 'string' ? raw.password : undefined,
    timeoutMs: typeof raw.timeoutMs === 'number' ? raw.timeoutMs : undefined,
    reconnectDelayMs:
      typeof raw.reconnectDelayMs === 'number' ? raw.reconnectDelayMs : undefined,
    protocol: raw.protocol === 'wss:' ? 'wss:' : 'ws:',
  };
}

function toJsonTextContent(data: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function toErrorContent(error: unknown) {
  return { content: [{ type: 'text', text: `Ecomet error: ${String(error)}` }] };
}

function toPlainTextContent(text: string) {
  return { content: [{ type: 'text', text }] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTypesInfoRequest(rawParams: unknown): TypesInfoToolParams {
  if (rawParams === '*') {
    return rawParams;
  }

  if (!isRecord(rawParams)) {
    throw new Error('types_info expects "*" or an object mapping type paths to "*" or string[] field lists.');
  }

  if (Object.keys(rawParams).length === 0) {
    return '*';
  }

  const normalized: Record<string, '*' | string[]> = {};

  for (const [rawTypePath, rawValue] of Object.entries(rawParams)) {
    const typePath = rawTypePath.trim();
    if (typePath.length === 0) {
      throw new Error('types_info type keys must be non-empty strings.');
    }

    if (rawValue === '*') {
      normalized[typePath] = '*';
      continue;
    }

    if (!Array.isArray(rawValue) || rawValue.length === 0) {
      throw new Error(
        `types_info value for ${typePath} must be "*" or a non-empty array of field names.`,
      );
    }

    const fields: string[] = [];
    const seen = new Set<string>();

    for (const entry of rawValue) {
      if (typeof entry !== 'string' || entry.trim().length === 0) {
        throw new Error(
          `types_info field list for ${typePath} must contain only non-empty strings.`,
        );
      }

      const fieldName = entry.trim();
      if (seen.has(fieldName)) {
        continue;
      }

      seen.add(fieldName);
      fields.push(fieldName);
    }

    normalized[typePath] = fields;
  }

  if (Object.keys(normalized).length === 0) {
    throw new Error(
      'types_info object request must contain at least one type path, for example { "/root/FP/prototypes/point/fields": "*" }.',
    );
  }

  return normalized;
}

async function buildTypesInfoResult(
  indexRegistry: IndexRegistry,
  rawParams: unknown,
) {
  const params = normalizeTypesInfoRequest(rawParams);
  const result: Record<string, unknown> = {};

  if (params === '*') {
    for (const typePath of listKnownTypes(indexRegistry)) {
      result[typePath] = (await listFieldsForType(indexRegistry, typePath)) ?? 'invalid type';
    }

    return result;
  }

  for (const [typePath, requestedFields] of Object.entries(params)) {
    if (requestedFields === '*') {
      result[typePath] = (await listFieldsForType(indexRegistry, typePath)) ?? 'invalid type';
      continue;
    }

    result[typePath] = await getTypeFieldIndexes(indexRegistry, typePath, requestedFields);
  }

  return result;
}

export default function register(api: any) {
  const client = new EcometClient(readConfig(api), api.logger);
  const indexRegistry = new IndexRegistry(client);

  indexRegistry
    .init()
    .catch((err) => api.logger?.warn?.(`IndexRegistry init: ${String(err)}`));

  setInterval(() => {
    indexRegistry
      .update()
      .catch((err) => api.logger?.warn?.(`IndexRegistry refresh: ${String(err)}`));
  }, 24 * 60 * 60 * 1000);

  api.registerGatewayMethod('ecomet.status', async ({ respond }: any) => {
    try {
      await client.connect();
      respond(true, { ok: client.isConnected(), state: client.getState() });
    } catch (error) {
      respond(false, {
        ok: false,
        state: client.getState(),
        error: String(error),
      });
    }
  });

  api.registerCommand({
    name: 'ecomet_check',
    description: 'Connect/login to Ecomet and report status',
    acceptsArgs: false,
    requireAuth: true,
    handler: async () => {
      try {
        await client.connect();
        return {
          text: `Ecomet: ${client.isConnected() ? 'OK' : 'FAIL'} — state=${client.getState()}`,
        };
      } catch (error) {
        return { text: `Ecomet: FAIL — ${String(error)}` };
      }
    },
  });

  api.registerTool(
    {
      name: 'skill_run',
      description:
        'Run a workspace skill module. Returns chat markdown or ViewModelContract JSON. Prefer the canonical skill params from the activated SKILL.md, pass skill-specific parameters directly alongside skill and format, and never pre-compute epoch milliseconds or raw-tool-only time fields when a skill applies.',
      parameters: {
        type: 'object',
        additionalProperties: true,
        properties: {
          skill: {
            type: 'string',
            description:
              'Skill folder name, e.g. "scada-object-explore", "scada-point-history".',
          },
          params: {
            type: 'object',
            additionalProperties: true,
            description:
              'Skill-specific params. Can also pass params as top-level properties directly.',
          },
          format: {
            type: 'string',
            enum: ['json', 'chat'],
            description: 'Return raw ViewModelContract JSON or rendered chat markdown.',
          },
        },
        required: ['skill'],
      },
      async execute(_id: string, rawParams: Record<string, unknown>) {
        try {
          const skill = rawParams.skill as string;
          const format = rawParams.format as SkillRunToolParams['format'];

          // Build params: use explicit params object if provided,
          // otherwise collect all extra top-level properties as params
          let skillParams: Record<string, unknown>;
          if (rawParams.params && typeof rawParams.params === 'object' && !Array.isArray(rawParams.params)) {
            skillParams = rawParams.params as Record<string, unknown>;
          } else {
            const { skill: _s, format: _f, params: _p, ...extra } = rawParams;
            skillParams = Object.keys(extra).length > 0 ? extra : {};
          }

          const result = await runSkill({ skill, format, params: skillParams }, {
            apiConfig: api.config,
            client,
            indexRegistry,
          });
          return toPlainTextContent(result);
        } catch (error) {
          api.logger?.error?.(`skill_run failed: ${String(error)}`);
          return toPlainTextContent(
            error instanceof Error ? error.message : String(error),
          );
        }
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: 'ecomet_api',
      description:
        'Execute Ecomet QL queries through EcometClient. Supported actions: query, query_objects.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: {
            type: 'string',
            enum: ['query', 'query_objects'],
          },
          statement: { type: 'string' },
          timeoutMs: { type: 'number' },
        },
        required: ['action', 'statement'],
      },
      async execute(_id: string, params: ToolParams) {
        try {
          if (!params.statement || typeof params.statement !== 'string') {
            throw new Error('statement is required');
          }

          if (params.action === 'query') {
            const result = await client.query(params.statement, {
              timeout: params.timeoutMs,
            });
            return toJsonTextContent(result);
          }

          if (params.action === 'query_objects') {
            const result = await client.queryObjects(params.statement, {
              timeout: params.timeoutMs,
            });
            return toJsonTextContent(result);
          }

          throw new Error(`unsupported action: ${String(params.action)}`);
        } catch (error) {
          api.logger?.error?.(`ecomet_api failed: ${String(error)}`);
          return toErrorContent(error);
        }
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: 'ecomet_read',
      description:
        'FALLBACK TOOL - use scada-object-explore skill instead when available. Read field values from one or more known Ecomet objects by path when a direct skill path is not available yet.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          objects: {
            type: 'array',
            items: { type: 'string' },
            description: "Object paths to read (e.g., '/root/FP/PROJECT/.../OBJECT')",
          },
          fields: {
            type: 'array',
            items: { type: 'string' },
            description:
              "Field names to read (system fields start with '.', user fields don't)",
          },
        },
        required: ['objects', 'fields'],
      },
      async execute(_id: string, params: ReadToolParams) {
        try {
          const result = await readObjects(client, params);
          return toJsonTextContent(result);
        } catch (error) {
          api.logger?.error?.(`ecomet_read failed: ${String(error)}`);
          return toErrorContent(error);
        }
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: 'archive_read',
      description:
        "Read raw time-series data points from Ecomet archives. Returns [timestamp, value] pairs for each archive path within the specified time range. Timestamps are in milliseconds since epoch. Change-driven storage: gaps between points mean value unchanged. First point may precede 'from' (effective value at range start). Null values mean 'value became unknown'.",
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          archives: {
            type: 'array',
            items: { type: 'string' },
            description:
              "Archive paths to read (e.g., '/root/FP/PROJECT/.../ARCHIVE_NAME'). If any path is invalid, the entire request fails.",
          },
          from: {
            type: 'number',
            description: 'Start of time range (inclusive), Unix timestamp in milliseconds.',
          },
          to: {
            type: 'number',
            description: 'End of time range (inclusive), Unix timestamp in milliseconds.',
          },
        },
        required: ['archives', 'from', 'to'],
      },
      async execute(_id: string, params: ArchiveReadToolParams) {
        try {
          const result = await readArchives(client, params);
          return toJsonTextContent(result);
        } catch (error) {
          api.logger?.error?.(`archive_read failed: ${String(error)}`);
          return toErrorContent(error);
        }
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: 'archive_snapshot',
      description:
        'Get archive values at a specific moment in time. Returns the effective value for each archive path at the requested timestamp. Snapshot semantics: returns the last known value at or before the timestamp. If no history exists before the timestamp, the value is undefined. Null means the value was explicitly unknown at that moment. Timestamps are in milliseconds since epoch.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          archives: {
            type: 'array',
            items: { type: 'string' },
            description:
              "Archive paths to query (e.g., '/root/FP/PROJECT/.../ARCHIVE_NAME'). If any path is invalid, the entire request fails.",
          },
          timestamp: {
            type: 'number',
            description: 'The moment in time to get values at, Unix timestamp in milliseconds.',
          },
        },
        required: ['archives', 'timestamp'],
      },
      async execute(_id: string, params: ArchiveSnapshotToolParams) {
        try {
          const result = await getSnapshot(client, params);
          return toJsonTextContent(result);
        } catch (error) {
          api.logger?.error?.(`archive_snapshot failed: ${String(error)}`);
          return toErrorContent(error);
        }
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: 'archive_aggregates',
      description:
        "Compute statistical aggregates (avg, min, max, integral, standard_deviation) over archive time-series data for one or more periods. avg, integral, and standard_deviation are time-weighted. integral returns value*ms units — divide by 3600000 for value-hours (for example, kW integral / 3600000 = kWh). Timestamps define consecutive periods: [T0,T1), [T1,T2), ... N+1 timestamps = N periods. Invalid archive paths are listed in 'invalid' without failing the entire request.",
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          aggregates: {
            type: 'array',
            items: {
              type: 'array',
              items: { type: 'string' },
              minItems: 2,
              maxItems: 2,
            },
            description:
              "Array of [archivePath, functionName] pairs. Functions: 'avg', 'min', 'max', 'integral', 'standard_deviation', or custom 'module:function'. Same archive can appear with different functions.",
          },
          timestamps: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            description:
              'Array of timestamps in milliseconds defining consecutive periods. [T0, T1, T2] defines [T0,T1) and [T1,T2). Must be monotonically increasing.',
          },
        },
        required: ['aggregates', 'timestamps'],
      },
      async execute(_id: string, params: ArchiveAggregatesToolParams) {
        try {
          const result = await getAggregates(client, params);
          return toJsonTextContent(result);
        } catch (error) {
          api.logger?.error?.(`archive_aggregates failed: ${String(error)}`);
          return toErrorContent(error);
        }
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: 'archive_resolve',
      description:
        "FALLBACK TOOL - use scada-archive-coverage skill instead when available. Find which archive stores history for each object+field pair. Resolved pairs return archive paths; pairs without an archive are returned as unresolved (equivalent to null), and invalid object paths are listed in invalid.",
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tags: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                object: {
                  type: 'string',
                  description: "Full object path (e.g., '/root/FP/PROJECT/.../OBJECT')",
                },
                field: {
                  type: 'string',
                  description: "Field name to resolve (e.g., 'value', 'quality', '.name')",
                },
              },
              required: ['object', 'field'],
            },
            description: 'Array of object+field pairs to resolve to archive paths.',
          },
        },
        required: ['tags'],
      },
      async execute(_id: string, params: ArchiveResolveToolParams) {
        try {
          const result = await resolveArchives(client, params);
          return toJsonTextContent(result);
        } catch (error) {
          api.logger?.error?.(`archive_resolve failed: ${String(error)}`);
          return toErrorContent(error);
        }
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: 'field_read_history',
      description:
        "FALLBACK TOOL - use scada-point-history skill instead when available. Read raw time-series history by object+field. Resolves archive paths internally and returns { values, invalid, unresolved }.",
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tags: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                object: {
                  type: 'string',
                  description:
                    "Full path of the Ecomet object (e.g., '/root/FP/PROJECT/.../POINT')",
                },
                field: {
                  type: 'string',
                  description:
                    "Field name to read history for (e.g., 'value', 'out_value', 'state_connection')",
                },
              },
              required: ['object', 'field'],
            },
            description:
              'Array of { object, field } pairs to read history for. Same object can appear with different fields.',
          },
          from: {
            type: 'number',
            description: 'Start of time range (inclusive), Unix timestamp in milliseconds.',
          },
          to: {
            type: 'number',
            description: 'End of time range (inclusive), Unix timestamp in milliseconds.',
          },
        },
        required: ['tags', 'from', 'to'],
      },
      async execute(_id: string, params: FieldReadHistoryToolParams) {
        try {
          const result = await fieldReadHistory(client, params);
          return toJsonTextContent(result);
        } catch (error) {
          api.logger?.error?.(`field_read_history failed: ${String(error)}`);
          return toErrorContent(error);
        }
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: 'field_snapshot',
      description:
        "FALLBACK TOOL - use scada-point-snapshot skill instead when available. Get values at a specific moment by object+field. Resolves archive paths internally and returns { values, invalid, unresolved }.",
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tags: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                object: {
                  type: 'string',
                  description:
                    "Full path of the Ecomet object (e.g., '/root/FP/PROJECT/.../POINT')",
                },
                field: {
                  type: 'string',
                  description:
                    "Field name to get snapshot for (e.g., 'value', 'out_value', 'state_connection')",
                },
              },
              required: ['object', 'field'],
            },
            description:
              'Array of { object, field } pairs to get snapshot values for. Same object can appear with different fields.',
          },
          timestamp: {
            type: 'number',
            description: 'The moment in time to get values at, Unix timestamp in milliseconds.',
          },
        },
        required: ['tags', 'timestamp'],
      },
      async execute(_id: string, params: FieldSnapshotToolParams) {
        try {
          const result = await fieldSnapshot(client, params);
          return toJsonTextContent(result);
        } catch (error) {
          api.logger?.error?.(`field_snapshot failed: ${String(error)}`);
          return toErrorContent(error);
        }
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: 'field_aggregates',
      description:
        "FALLBACK TOOL - use scada-period-aggregates skill instead when available. Compute aggregate statistics over time periods by object+field. Resolves archive paths internally and returns { values, invalid, unresolved }.",
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tags: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                object: {
                  type: 'string',
                  description:
                    "Full path of the Ecomet object (e.g., '/root/FP/PROJECT/.../POINT')",
                },
                field: {
                  type: 'string',
                  description:
                    "Field name to aggregate (e.g., 'value', 'out_value', 'state_connection')",
                },
                functions: {
                  type: 'array',
                  items: { type: 'string' },
                  minItems: 1,
                  description:
                    "Aggregate function names for this tag: 'avg', 'min', 'max', 'integral', 'standard_deviation', or custom 'module:function'.",
                },
              },
              required: ['object', 'field', 'functions'],
            },
            description:
              "Array of { object, field, functions } triples. Duplicate object+field tags are merged by function union.",
          },
          timestamps: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            description:
              'Array of timestamps in milliseconds defining consecutive periods. [T0, T1, T2] defines [T0,T1) and [T1,T2). Must be monotonically increasing.',
          },
        },
        required: ['tags', 'timestamps'],
      },
      async execute(_id: string, params: FieldAggregatesToolParams) {
        try {
          const result = await fieldAggregates(client, params);
          return toJsonTextContent(result);
        } catch (error) {
          api.logger?.error?.(`field_aggregates failed: ${String(error)}`);
          return toErrorContent(error);
        }
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: 'ecomet_search',
      description:
        'FALLBACK TOOL - use scada-object-explore skill instead when available. Find SCADA objects under /root/FP/PROJECT by type, location, field values, or text search.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          pattern: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
            description:
              "Object type filter — single pattern path or array of pattern paths (e.g., '/root/.patterns/alarm' or ['/root/.patterns/alarm', '/root/.patterns/event'])",
          },
          folder: {
            type: 'string',
            description: 'Scope results to objects under this folder path',
          },
          recursive: {
            type: 'boolean',
            description:
              'When true (default), folder search includes all descendants (subtree). When false, matches only immediate children.',
          },
          fields: {
            type: 'object',
            additionalProperties: true,
            description: 'Exact-match field value filters (e.g., { "active": true, "type": "KA" })',
          },
          search: {
            type: 'object',
            additionalProperties: false,
            properties: {
              text: {
                type: 'string',
                description: 'Substring to search for (minimum 3 characters)',
              },
              in: {
                type: 'array',
                items: { type: 'string' },
                description: 'Field names to search in (e.g., [".name", "text"])',
              },
            },
            required: ['text', 'in'],
            description: 'Substring search across specified fields',
          },
          select: {
            type: 'array',
            items: { type: 'string' },
            description: 'Fields to include in results (e.g., [".name", ".fp_path", "out_value"])',
          },
          limit: {
            type: 'number',
            description: 'Maximum objects to return (default: 100)',
          },
          offset: {
            type: 'number',
            description: 'Number of objects to skip for pagination (default: 0)',
          },
        },
        required: ['select'],
      },
      async execute(_id: string, params: SearchToolParams) {
        try {
          const result = await searchObjects(client, indexRegistry, params);
          return toJsonTextContent(result);
        } catch (error) {
          api.logger?.error?.(`ecomet_search failed: ${String(error)}`);
          return toErrorContent(error);
        }
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: 'alarm_query',
      description:
        "FALLBACK TOOL - use scada-alarm-list skill instead when available. Query alarms from the Ecomet archive database with exact time, state, scope, and paging filters. Use only when exact epoch boundaries are already known; never derive them from natural-language ranges like 'last hour' or 'now' in the model.",
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          time_from: {
            type: 'number',
            description:
              'Start of time range (inclusive), Unix timestamp in milliseconds. Filters on dt_on. REQUIRED. Do not estimate this from natural-language time; use scada-alarm-list for human time ranges.',
          },
          time_to: {
            type: 'number',
            description:
              'End of time range (exclusive), Unix timestamp in milliseconds. Filters on dt_on. REQUIRED. Max 30 days from time_from. Do not estimate this from natural-language time; use scada-alarm-list for human time ranges.',
          },
          active: {
            type: 'boolean',
            description:
              'Filter by alarm active state: true = active only, false = inactive only, omitted = both',
          },
          acknowledged: {
            type: 'boolean',
            description:
              'Filter by acknowledgment state: true = acknowledged only, false = unacknowledged only, omitted = both',
          },
          folders: {
            type: 'array',
            items: { type: 'string' },
            description:
              "Scope alarms by source object location. Filters on 'point' field via LIKE with trailing '/'. Use relevant project paths such as [\"/COUNTRY_A/REGION_1\"]. Full '/root/FP/PROJECT/...' paths are also normalized.",
          },
          fields: {
            type: 'object',
            additionalProperties: true,
            description:
              'Exact-match field value filters (e.g., { "fact": "KA", "type": "..." }). Do not use for active/acknowledged — use dedicated parameters.',
          },
          search: {
            type: 'object',
            additionalProperties: false,
            properties: {
              text: {
                type: 'string',
                description: 'Substring to search for (minimum 3 characters)',
              },
              in: {
                type: 'array',
                items: { type: 'string' },
                description: 'Alarm field names to search in (e.g., ["text", "point", "comment"])',
              },
            },
            required: ['text', 'in'],
            description: 'Substring search across specified alarm fields',
          },
          select: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Fields to include in results. dt_on is always auto-included for ordering. Common fields: "text", "dt_on", "point", "fact", "active", "acknowledged"',
          },
          limit: {
            type: 'number',
            description: 'Maximum alarms to return (default: 200)',
          },
          offset: {
            type: 'number',
            description: 'Number of alarms to skip for pagination (default: 0)',
          },
        },
        required: ['time_from', 'time_to', 'select'],
      },
      async execute(_id: string, params: AlarmQueryToolParams) {
        try {
          const result = await queryAlarms(client, params);
          return toJsonTextContent(result);
        } catch (error) {
          api.logger?.error?.(`alarm_query failed: ${String(error)}`);
          return toErrorContent(error);
        }
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: 'ecomet_indexes',
      description:
        'Get field index information for one specific Ecomet pattern. Use this for narrow single-pattern detail lookup; use types_info for broader type, field, and index discovery.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          pattern: {
            type: 'string',
            description:
              "Pattern path to inspect (e.g., '/root/.patterns/alarm' or '/root/FP/prototypes/telemetry/fields')",
          },
        },
        required: ['pattern'],
      },
      async execute(_id: string, params: IndexesToolParams) {
        try {
          const result = await getPatternIndexes(indexRegistry, params.pattern);
          return toJsonTextContent(result);
        } catch (error) {
          api.logger?.error?.(`ecomet_indexes failed: ${String(error)}`);
          return toErrorContent(error);
        }
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: 'types_info',
      description:
        'List known Ecomet types, their fields, and available indexes. Call `types_info("*")` for the full registry view, or `types_info({ "/root/FP/prototypes/point/fields": "*" })` / explicit field lists per type path. Never stop at `{}`; retry with one of those canonical shapes.',
      parameters: {
        oneOf: [
          {
            type: 'string',
            enum: ['*'],
            description: 'Return all known types and all fields for each type.',
          },
          {
            type: 'object',
            minProperties: 1,
            additionalProperties: {
              oneOf: [
                {
                  type: 'string',
                  enum: ['*'],
                },
                {
                  type: 'array',
                  items: { type: 'string' },
                },
              ],
            },
            description:
              'Map type paths to "*" for all fields or to explicit field-name arrays, for example { "/root/FP/prototypes/point/fields": "*" }.',
            examples: [
              {
                '/root/FP/prototypes/point/fields': '*',
              },
              {
                '/root/FP/prototypes/type-a/fields': ['state', 'quality'],
              },
            ],
          },
        ],
      },
      async execute(_id: string, params: TypesInfoToolParams) {
        try {
          const result = await buildTypesInfoResult(indexRegistry, params);
          return toJsonTextContent(result);
        } catch (error) {
          api.logger?.error?.(`types_info failed: ${String(error)}`);
          return toErrorContent(error);
        }
      },
    },
    { optional: true },
  );
}
