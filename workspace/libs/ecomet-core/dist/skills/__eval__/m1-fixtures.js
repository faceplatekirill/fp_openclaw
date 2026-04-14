export const M1_EVAL_FIXTURES = [
    {
        id: 'RF-1',
        type: 'routing',
        title: 'Unknown path routes to object explore',
        user_intent: 'Find the pressure point for Bay L2831 in the 220 kV area.',
        expected_skill: 'scada-object-explore',
        not_skills: [
            {
                skill: 'scada-point-history',
                reason: 'The full object path is still unknown, so deeper archive work is premature.',
            },
        ],
        expected_behavior: 'Route to discovery first so the skill narrows the canonical object path before any deeper read.',
        anti_pattern: 'Treat a vague asset reference as if the full archive tag were already known and jump directly to history.',
    },
    {
        id: 'RF-2',
        type: 'routing',
        title: 'Type discovery routes to object explore',
        user_intent: 'What object types exist in this station?',
        expected_skill: 'scada-object-explore',
        not_skills: [
            {
                skill: 'scada-data-quality',
                reason: 'The user wants topology or pattern discovery, not runtime health facts.',
            },
        ],
        expected_behavior: 'Use discovery to summarize the available object types or patterns in scope.',
        anti_pattern: 'Treat a topology question as a telemetry-quality question.',
    },
    {
        id: 'RF-3',
        type: 'routing',
        title: 'Trend request routes to point history',
        user_intent: 'Show the history for /root/.../L2831/P field out_value for the last hour.',
        expected_skill: 'scada-point-history',
        not_skills: [
            {
                skill: 'scada-point-snapshot',
                reason: 'The user asked for a range trend, not one exact timestamp.',
            },
        ],
        expected_behavior: 'Use the history skill for known-tag trend data with resolved time semantics and partiality handling.',
        anti_pattern: 'Route a trend request to the exact-time snapshot path.',
    },
    {
        id: 'RF-4',
        type: 'routing',
        title: 'Exact-time question routes to point snapshot',
        user_intent: 'What was /root/.../L2831/P field out_value at 2026-03-16 12:00 Asia/Almaty?',
        expected_skill: 'scada-point-snapshot',
        not_skills: [
            {
                skill: 'scada-point-history',
                reason: 'The user asked for one exact effective value.',
            },
        ],
        expected_behavior: 'Use the snapshot skill for one exact-time value with invalid and unresolved outcomes preserved.',
        anti_pattern: 'Substitute a trend table for an exact-time read.',
    },
    {
        id: 'RF-5',
        type: 'routing',
        title: 'Statistics route to period aggregates',
        user_intent: 'Show the average pressure by hour for the last day.',
        expected_skill: 'scada-period-aggregates',
        not_skills: [
            {
                skill: 'scada-point-history',
                reason: 'History returns raw points, not deterministic bucketed statistics.',
            },
        ],
        expected_behavior: 'Use the aggregate skill so bucket edges and function semantics are deterministic in code.',
        anti_pattern: 'Treat an aggregate request as a raw history read and leave bucketing to the model.',
    },
    {
        id: 'RF-6',
        type: 'routing',
        title: 'Peak plus when routes to period aggregates first',
        user_intent: 'What was the peak pressure today and when did it occur?',
        expected_skill: 'scada-period-aggregates',
        not_skills: [
            {
                skill: 'scada-point-history',
                reason: 'The workflow must establish the peak through aggregates before locating the timestamp.',
            },
        ],
        expected_behavior: 'Run the canonical aggregate-first json chain before any exact-timestamp follow-up.',
        anti_pattern: 'Do history-first reasoning with no typed aggregate step.',
    },
    {
        id: 'RF-7',
        type: 'routing',
        title: 'Archive existence routes to archive coverage',
        user_intent: 'Is field state_graph archived for this object?',
        expected_skill: 'scada-archive-coverage',
        not_skills: [
            {
                skill: 'scada-point-history',
                reason: 'The user first needs coverage, not a failed history read.',
            },
        ],
        expected_behavior: 'Use the coverage skill to report archived and unarchived outcomes explicitly.',
        anti_pattern: 'Probe history first instead of answering the archive-existence question directly.',
    },
    {
        id: 'RF-8',
        type: 'routing',
        title: 'Raw alarm retrieval routes to alarm list',
        user_intent: 'Show alarms in this scope for the last 24 hours.',
        expected_skill: 'scada-alarm-list',
        not_skills: [
            {
                skill: 'scada-alarm-summary',
                reason: 'The user asked for raw alarm rows, not KPI analysis.',
            },
        ],
        expected_behavior: 'Use the deterministic alarm list skill for rows, totals, and continuation guidance.',
        anti_pattern: 'Switch to an alarm-summary or raw-tool-first path instead of the direct alarm-list surface.',
    },
    {
        id: 'RF-9',
        type: 'routing',
        title: 'Freshness question routes to data quality',
        user_intent: 'Is this telemetry stale or frozen?',
        expected_skill: 'scada-data-quality',
        not_skills: [
            {
                skill: 'scada-point-history',
                reason: 'History alone does not provide the full conservative quality assessment path.',
            },
        ],
        expected_behavior: 'Use the conservative data-quality skill so archive, current fields, and recent history are combined without over-diagnosis.',
        anti_pattern: 'Answer a freshness question with a plain history read and no current quality facts.',
    },
    {
        id: 'OF-1',
        type: 'output_contract',
        title: 'Object explore returns scope_view',
        user_intent: 'Run scada-object-explore with a limited folder search.',
        expected_skill: 'scada-object-explore',
        not_skills: [
            {
                skill: 'ecomet_read',
                reason: 'Canonical scope_view output belongs to the search-driven object-explore surface, not to an exact-path ecomet_read shortcut.',
            },
        ],
        expected_behavior: 'Return one scope block with mapped paths, type summary, provenance, and completeness signaling.',
        anti_pattern: 'Return ad hoc markdown or drop pagination metadata from the structured output.',
    },
    {
        id: 'OF-2',
        type: 'output_contract',
        title: 'Point history preserves warnings and provenance',
        user_intent: 'Run scada-point-history on one valid tag and one invalid tag.',
        expected_skill: 'scada-point-history',
        not_skills: [
            {
                skill: 'field_read_history',
                reason: 'Warnings and provenance must stay in the stable history view model instead of exposing raw field_read_history output directly.',
            },
        ],
        expected_behavior: 'Keep the valid history block, preserve warnings, and keep provenance tied to the resolved request window.',
        anti_pattern: 'Drop the valid block or hide invalid-tag warnings in the structured output.',
    },
    {
        id: 'OF-3',
        type: 'output_contract',
        title: 'Snapshot distinguishes null invalid and unresolved',
        user_intent: 'Run scada-point-snapshot on mixed valid null and unresolved tags.',
        expected_skill: 'scada-point-snapshot',
        not_skills: [
            {
                skill: 'field_snapshot',
                reason: 'Outcome distinctions must exist in the stable snapshot view model instead of exposing raw field_snapshot output directly.',
            },
        ],
        expected_behavior: 'Return one snapshot block where valid null values remain in values and invalid or unresolved tags remain explicit.',
        anti_pattern: 'Collapse all missing-looking outcomes into null.',
    },
    {
        id: 'OF-4',
        type: 'output_contract',
        title: 'Aggregates include bucket description and caveats',
        user_intent: 'Run scada-period-aggregates with avg and integral over 1 hour buckets.',
        expected_skill: 'scada-period-aggregates',
        not_skills: [
            {
                skill: 'field_aggregates',
                reason: 'Bucket semantics and caveats belong in the stable aggregate contract, not in raw field_aggregates output.',
            },
        ],
        expected_behavior: 'Return aggregate_table blocks with deterministic rows, bucket description, and caveats.',
        anti_pattern: 'Omit bucket metadata or hide time-weighting caveats in prose only.',
    },
    {
        id: 'OF-5',
        type: 'output_contract',
        title: 'Coverage reports mixed outcomes explicitly',
        user_intent: 'Run scada-archive-coverage on archived and unarchived fields together.',
        expected_skill: 'scada-archive-coverage',
        not_skills: [
            {
                skill: 'archive_resolve',
                reason: 'Coverage outcomes must remain explicit in the stable coverage block instead of exposing raw archive_resolve output directly.',
            },
        ],
        expected_behavior: 'Return one coverage block with archived, unarchived, and summary counts preserved.',
        anti_pattern: 'Drop unarchived rows from the response.',
    },
    {
        id: 'OF-6',
        type: 'output_contract',
        title: 'Alarm list surfaces pagination partiality',
        user_intent: 'Run scada-alarm-list with a mocked total above the returned page limit.',
        expected_skill: 'scada-alarm-list',
        not_skills: [
            {
                skill: 'alarm_query',
                reason: 'Pagination and continuation hints must remain in the stable alarm-list contract, not in raw alarm_query output.',
            },
        ],
        expected_behavior: 'Return alarm_list with the merged total, partial completeness, and continuation guidance.',
        anti_pattern: 'Present a first page as if it were a complete alarm list.',
    },
    {
        id: 'OF-7',
        type: 'output_contract',
        title: 'Data quality returns conservative fact notes',
        user_intent: 'Run scada-data-quality on one archived tag with readable companion fields.',
        expected_skill: 'scada-data-quality',
        not_skills: [
            {
                skill: 'scada-archive-coverage',
                reason: 'Quality facts require the combined data-quality path, not the narrower archive-coverage skill alone.',
            },
        ],
        expected_behavior: 'Return one coverage block with archive, current quality, timestamp, and recent-history facts.',
        anti_pattern: 'Invent a root cause instead of reporting conservative facts.',
    },
    {
        id: 'EF-1',
        type: 'edge_case',
        title: 'Object explore keeps broad projected reads on one search path',
        user_intent: 'Run object explore with select against a broad 18-row search result.',
        expected_skill: 'scada-object-explore',
        not_skills: [
            {
                skill: 'ecomet_read',
                reason: 'Broad scope reads should stay on the search-driven path until exact paths are the only remaining task.',
            },
        ],
        expected_behavior: 'Return projected fields for the page, avoid extra read phases, and preserve pagination-based completeness only.',
        anti_pattern: 'Reintroduce a second read phase or synthetic partiality just because the projected page is broad.',
    },
    {
        id: 'EF-2',
        type: 'edge_case',
        title: 'History keeps carry-forward semantics visible',
        user_intent: 'Run history where the first point predates the requested start.',
        expected_skill: 'scada-point-history',
        not_skills: [
            {
                skill: 'field_read_history',
                reason: 'Carry-forward semantics must remain visible in the stable history block instead of relying on raw field_read_history output.',
            },
        ],
        expected_behavior: 'Keep the block valid and add a note that the earlier point may define the effective range-start value.',
        anti_pattern: 'Silently trim the earlier point and imply the start value was unknown.',
    },
    {
        id: 'EF-3',
        type: 'edge_case',
        title: 'History no-data still returns a block',
        user_intent: 'Run history on a resolved tag with no points in the requested window.',
        expected_skill: 'scada-point-history',
        not_skills: [
            {
                skill: 'field_read_history',
                reason: 'The no-data condition must stay in the stable history output instead of relying on raw field_read_history output.',
            },
        ],
        expected_behavior: 'Keep an empty history block and add a no-data note.',
        anti_pattern: 'Drop the tag entirely because the series is empty.',
    },
    {
        id: 'EF-4',
        type: 'edge_case',
        title: 'Snapshot keeps invalid and unresolved distinct',
        user_intent: 'Run snapshot with valid-null invalid and unresolved outcomes together.',
        expected_skill: 'scada-point-snapshot',
        not_skills: [
            {
                skill: 'field_snapshot',
                reason: 'Outcome distinctions must be preserved in the stable snapshot block instead of relying on raw field_snapshot output.',
            },
        ],
        expected_behavior: 'Keep only valid-null tags in values and preserve invalid and unresolved lists explicitly.',
        anti_pattern: 'Collapse distinct failure modes into null.',
    },
    {
        id: 'EF-5',
        type: 'edge_case',
        title: 'Aggregate day buckets preserve DST semantics',
        user_intent: 'Run daily aggregates across a DST transition.',
        expected_skill: 'scada-period-aggregates',
        not_skills: [
            {
                skill: 'scada-point-history',
                reason: 'The fixture is about deterministic day buckets, not raw trend data.',
            },
        ],
        expected_behavior: 'Keep local day boundaries, explicit timezone provenance, and DST caveats when day length changes.',
        anti_pattern: 'Step in UTC with no disclosure and lose local-day semantics.',
    },
    {
        id: 'EF-6',
        type: 'edge_case',
        title: 'Coverage chunking preserves request order',
        user_intent: 'Run archive coverage on more than 50 mixed tags.',
        expected_skill: 'scada-archive-coverage',
        not_skills: [
            {
                skill: 'archive_resolve',
                reason: 'The stable skill must batch internally instead of silently truncating.',
            },
        ],
        expected_behavior: 'Batch internally and still return entries in first-seen input order after de-duplication.',
        anti_pattern: 'Silently truncate or reorder rows by batch.',
    },
    {
        id: 'EF-7',
        type: 'edge_case',
        title: 'Alarm list splits long requests into compliant windows',
        user_intent: 'Run alarm list over a 45-day range.',
        expected_skill: 'scada-alarm-list',
        not_skills: [
            {
                skill: 'alarm_query',
                reason: 'The raw alarm query has a 30-day limit and is not the stable routing target.',
            },
        ],
        expected_behavior: 'Split the range into compliant windows, merge deterministically, and disclose the split.',
        anti_pattern: 'Send one illegal 45-day alarm query or silently truncate to 30 days.',
    },
    {
        id: 'EF-8',
        type: 'edge_case',
        title: 'Alarm list surfaces page loss explicitly',
        user_intent: 'Run alarm list with a page limit smaller than the available result set.',
        expected_skill: 'scada-alarm-list',
        not_skills: [
            {
                skill: 'alarm_query',
                reason: 'Page loss must be signaled in the stable alarm-list output, not in raw alarm_query output.',
            },
        ],
        expected_behavior: 'Mark the result partial, preserve accurate totals, and include continuation guidance.',
        anti_pattern: 'Present the returned subset as a complete list.',
    },
    {
        id: 'EF-9',
        type: 'edge_case',
        title: 'Data quality stays conservative on flat history',
        user_intent: 'Run data quality on a flat signal with nominal companion fields.',
        expected_skill: 'scada-data-quality',
        not_skills: [
            {
                skill: 'scada-point-history',
                reason: 'The conservative quality skill owns the fact synthesis for this edge case.',
            },
        ],
        expected_behavior: 'Report raw facts about archive, companion fields, and recent history without diagnosing failure.',
        anti_pattern: 'Declare sensor failure from flat history alone.',
    },
];
//# sourceMappingURL=m1-fixtures.js.map
