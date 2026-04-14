export const M0_EVAL_FIXTURES = [
    {
        id: 'RF-1',
        type: 'routing',
        title: 'Alarm rate by hour routes to alarm summary',
        user_intent: 'What is the alarm rate by hour for the last shift?',
        expected_skill: 'scada-alarm-summary',
        not_skills: [
            {
                skill: 'scada-period-aggregates',
                reason: '"alarm" plus "rate" refers to alarm frequency, not field aggregates.',
            },
        ],
        expected_behavior: 'Route to scada-alarm-summary so the skill can compute alarm frequency KPIs from alarm records.',
        anti_pattern: 'Treat the question as a field aggregate request and answer it via archive statistics alone.',
    },
    {
        id: 'RF-2',
        type: 'routing',
        title: 'Peak pressure first routes to period aggregates',
        user_intent: 'What was the peak pressure today and when did it occur?',
        expected_skill: 'scada-period-aggregates',
        not_skills: [
            {
                skill: 'scada-point-history',
                reason: 'History alone does not establish the max aggregate before locating the timestamp.',
            },
        ],
        expected_behavior: 'Route first to scada-period-aggregates to find the peak, then use scada-point-history to locate when it occurred.',
        anti_pattern: 'Route directly to raw history and skip the aggregate-first composition that identifies the peak.',
    },
    {
        id: 'RF-3',
        type: 'routing',
        title: 'Object type discovery routes to object explore',
        user_intent: 'What object types exist in this area?',
        expected_skill: 'scada-object-explore',
        not_skills: [
            {
                skill: 'scada-point-history',
                reason: 'The user wants topology and type discovery, not archived time-series data.',
            },
        ],
        expected_behavior: 'Route to scada-object-explore to discover patterns, types, and candidate objects in scope.',
        anti_pattern: 'Treat discovery as an archive or alarm question instead of returning topology metadata.',
    },
    {
        id: 'DB-1',
        type: 'delegation_boundary',
        title: 'Alarm KPIs stay on the alarm-summary skill surface',
        user_intent: 'Which alarms fired most often in the last shift?',
        expected_skill: 'scada-alarm-summary',
        not_skills: [
            {
                skill: 'alarm-analyst',
                reason: 'alarm-analyst is an internal delegated context, not the user-facing routing target.',
            },
        ],
        expected_behavior: 'The supervisor routes to scada-alarm-summary, and that skill may internally delegate to alarm-analyst with a restricted subset.',
        anti_pattern: 'Let the supervisor delegate directly to alarm-analyst or compute alarm KPIs inline without the stable skill surface.',
    },
    {
        id: 'DB-2',
        type: 'delegation_boundary',
        title: 'Incident timeline remains orchestrated in main-supervisor',
        user_intent: 'What happened between 02:00 and 04:00?',
        expected_skill: 'scada-incident-review',
        not_skills: [
            {
                skill: 'alarm-analyst',
                reason: 'Incident review spans multiple data sources and should not be delegated to the alarm KPI specialist.',
            },
        ],
        expected_behavior: 'Keep orchestration in main-supervisor under the scada-incident-review surface, composing alarms and trends directly.',
        anti_pattern: 'Delegate the whole incident review to alarm-analyst, which only owns alarm KPI workflows.',
    },
    {
        id: 'EF-1',
        type: 'edge_case',
        title: 'Alarm pagination surfaces partiality',
        user_intent: 'Show me the alarms for the selected period.',
        expected_skill: 'scada-alarm-list',
        not_skills: [
            {
                skill: 'alarm_query',
                reason: 'Partial-result detection belongs in the stable alarm-list contract, not in raw alarm_query output.',
            },
        ],
        expected_behavior: 'When total exceeds returned results, mark completeness as partial, preserve total counts, and provide continuation guidance plus a warning.',
        anti_pattern: 'Present the returned page as if it were the full alarm result set or drop the total count.',
    },
    {
        id: 'EF-2',
        type: 'edge_case',
        title: 'Invalid and unresolved snapshot values remain explicit',
        user_intent: 'Give me a snapshot of these tags right now.',
        expected_skill: 'scada-point-snapshot',
        not_skills: [
            {
                skill: 'field_snapshot',
                reason: 'The stable snapshot skill must preserve invalid and unresolved exceptions instead of exposing raw field_snapshot output directly.',
            },
        ],
        expected_behavior: 'Preserve invalid and unresolved tags separately from null values and surface warnings that explain why data is missing.',
        anti_pattern: 'Collapse invalid or unresolved tags into nulls or silently drop them from the snapshot output.',
    },
    {
        id: 'EF-3',
        type: 'edge_case',
        title: 'DST bucket boundaries preserve timezone semantics',
        user_intent: 'Show daily pressure aggregates across the DST change.',
        expected_skill: 'scada-period-aggregates',
        not_skills: [
            {
                skill: 'scada-point-history',
                reason: 'This fixture is about bucketed aggregates and timezone-aware day boundaries, not raw trend data.',
            },
        ],
        expected_behavior: 'Keep provenance.timezone explicit, preserve wall-clock day boundaries through the DST transition, and document any 23-hour or 25-hour bucket caveat.',
        anti_pattern: 'Bucket data in UTC without disclosure or silently lose data around the DST boundary.',
    },
    {
        id: 'EF-4',
        type: 'edge_case',
        title: 'Long alarm periods split into compliant windows',
        user_intent: 'Show alarms for the last 45 days.',
        expected_skill: 'scada-alarm-list',
        not_skills: [
            {
                skill: 'alarm_query',
                reason: 'The raw tool cannot safely serve as the stable routing target and has a 30-day limit.',
            },
        ],
        expected_behavior: 'Split the request into windows of 30 days or less, merge results, dedupe boundary overlaps, and report completeness for the merged response.',
        anti_pattern: 'Send a single 45-day query, silently truncate the period, or omit the fact that the result was merged from multiple windows.',
    },
    {
        id: 'EF-5',
        type: 'edge_case',
        title: 'Availability report stops when KB mappings are missing',
        user_intent: 'Give me the availability report for Pump P-101.',
        expected_skill: 'scada-availability-report',
        not_skills: [
            {
                skill: 'scada-object-explore',
                reason: 'Object discovery or current-scope reads should not guess state mappings for availability semantics.',
            },
        ],
        expected_behavior: 'Return needs_clarification behavior and ask which fields define running, stopped, and fault states instead of inferring them.',
        anti_pattern: 'Guess state mappings from field names and produce a fabricated availability report.',
    },
    {
        id: 'EF-6',
        type: 'edge_case',
        title: 'Alarm summary chat truncation keeps data boundaries explicit',
        user_intent: 'Summarize the top alarm offenders from this very large result set.',
        expected_skill: 'scada-alarm-summary',
        not_skills: [
            {
                skill: 'scada-alarm-list',
                reason: 'Top-offender chat summarization belongs to the summary skill, not to the row-oriented alarm-list surface.',
            },
        ],
        expected_behavior: 'Return the chat-facing summary from scada-alarm-summary, keep any visible truncation explicit, and preserve export as a downstream option instead of the primary route.',
        anti_pattern: 'Treat chat summarization as a spreadsheet-export request or pretend the visible top slice proves the whole result is small.',
    },
];
//# sourceMappingURL=m0-fixtures.js.map
