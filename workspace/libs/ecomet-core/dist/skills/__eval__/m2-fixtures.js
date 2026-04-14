export const M2_EVAL_FIXTURES = [
    {
        id: 'RF-1',
        type: 'routing',
        title: 'Alarm rate question routes to alarm summary',
        user_intent: 'What is the alarm rate per hour for AKMOLA 220 kV over the last 24 hours?',
        expected_skill: 'scada-alarm-summary',
        not_skills: [
            {
                skill: 'scada-alarm-list',
                reason: 'The user asked for a computed KPI, not a row listing.',
            },
            {
                skill: 'scada-period-aggregates',
                reason: 'This is alarm analytics, not measured-value aggregation.',
            },
        ],
        expected_behavior: 'Route to the deterministic alarm-summary skill so total alarms and alarms-per-hour are computed in code.',
        anti_pattern: 'Treat an alarm-rate question as either a raw alarm listing or a measured-value aggregate request.',
    },
    {
        id: 'RF-2',
        type: 'routing',
        title: 'Top offenders question routes to alarm summary',
        user_intent: 'Show me the top alarm offenders this week at the Akmola substation.',
        expected_skill: 'scada-alarm-summary',
        not_skills: [
            {
                skill: 'scada-alarm-list',
                reason: 'Listing rows does not rank alarm sources.',
            },
            {
                skill: 'scada-object-explore',
                reason: 'The request is analytical, not discovery-focused.',
            },
        ],
        expected_behavior: 'Use the alarm-summary path so source grouping, counts, and percentages are computed deterministically.',
        anti_pattern: 'Return raw alarms or object browsing results instead of a ranked offender list.',
    },
    {
        id: 'RF-3',
        type: 'routing',
        title: 'Raw alarm listing stays on alarm list',
        user_intent: 'List all TI alarms from the last hour for AKMOLA 220.',
        expected_skill: 'scada-alarm-list',
        not_skills: [
            {
                skill: 'scada-alarm-summary',
                reason: 'The user asked for individual alarm rows, not analytics.',
            },
        ],
        expected_behavior: 'Keep row-oriented retrieval on scada-alarm-list so filters and pagination semantics stay canonical.',
        anti_pattern: 'Route a listing request to the alarm-summary analytics surface.',
    },
    {
        id: 'RF-4',
        type: 'routing',
        title: 'Alarm flood question routes to alarm summary',
        user_intent: 'Were there any alarm floods yesterday at AKMOLA?',
        expected_skill: 'scada-alarm-summary',
        not_skills: [
            {
                skill: 'scada-alarm-list',
                reason: 'Flood detection requires windowed rate analysis, not a plain row dump.',
            },
            {
                skill: 'scada-data-quality',
                reason: 'The user is asking about alarm patterns, not telemetry freshness.',
            },
        ],
        expected_behavior: 'Route to alarm-summary so flood windows are detected with the defined threshold and time window.',
        anti_pattern: 'Answer a flood question with a plain alarm list or an unrelated quality diagnostic.',
    },
    {
        id: 'RF-5',
        type: 'routing',
        title: 'Standing alarms question routes to alarm summary',
        user_intent: 'What alarms are currently standing in the AKMOLA region?',
        expected_skill: 'scada-alarm-summary',
        not_skills: [
            {
                skill: 'scada-alarm-list',
                reason: 'Standing-alarm output deduplicates by source and reports since timestamps.',
            },
        ],
        expected_behavior: 'Use alarm-summary so active alarms are deduplicated by source and surfaced with earliest onset facts.',
        anti_pattern: 'Reduce a standing-alarm request to a raw active=true alarm listing.',
    },
    {
        id: 'RF-6',
        type: 'routing',
        title: 'Chattering request routes to alarm summary',
        user_intent: 'Any chattering alarms in the last 7 days?',
        expected_skill: 'scada-alarm-summary',
        not_skills: [
            {
                skill: 'scada-alarm-list',
                reason: 'Chattering requires occurrence counting across the period.',
            },
        ],
        expected_behavior: 'Use alarm-summary so repeated alarm sources are counted and ranked as chattering candidates.',
        anti_pattern: 'Return raw alarm rows and leave chattering detection to the model.',
    },
    {
        id: 'RF-7',
        type: 'routing',
        title: 'Export request routes to spreadsheet export',
        user_intent: 'Export these alarms to a CSV file.',
        expected_skill: 'report-spreadsheet-export',
        not_skills: [
            {
                skill: 'scada-alarm-list',
                reason: 'That skill fetches data but does not create files.',
            },
            {
                skill: 'scada-alarm-summary',
                reason: 'That skill computes analytics but does not perform export.',
            },
        ],
        expected_behavior: 'Use the export skill after a data-producing skill returns JSON so file generation stays deterministic.',
        anti_pattern: 'Have the model improvise CSV text or treat export as part of a data-retrieval skill.',
    },
    {
        id: 'RF-8',
        type: 'routing',
        title: 'Alarm summary request routes to alarm summary',
        user_intent: 'Give me an alarm summary for March 15th, 2026 at the AKMOLA 220 kV.',
        expected_skill: 'scada-alarm-summary',
        not_skills: [
            {
                skill: 'scada-alarm-list',
                reason: 'The user explicitly asked for a summary instead of rows.',
            },
        ],
        expected_behavior: 'Use the canonical alarm-summary skill for period-scoped alarm analytics requests.',
        anti_pattern: 'Ignore the summary intent and return a plain list of alarm rows.',
    },
    {
        id: 'OF-1',
        type: 'output_contract',
        title: 'Alarm summary returns the canonical summary view model',
        user_intent: 'Run scada-alarm-summary with a concrete scope and time range.',
        expected_skill: 'scada-alarm-summary',
        not_skills: [
            {
                skill: 'scada-alarm-list',
                reason: 'The summary skill must return canonical alarm_summary JSON instead of falling back to row-oriented alarm-list output.',
            },
        ],
        expected_behavior: 'Return one alarm_summary block with all six metric families, distributions, warnings, provenance, and completeness.',
        anti_pattern: 'Return ad hoc markdown or omit required summary metrics from the structured output.',
    },
    {
        id: 'OF-2',
        type: 'output_contract',
        title: 'Alarm summary chat rendering keeps all metric sections',
        user_intent: 'Run scada-alarm-summary with format chat.',
        expected_skill: 'scada-alarm-summary',
        not_skills: [
            {
                skill: 'scada-alarm-list',
                reason: 'Chat rendering must come from the summary view model, not from the row-oriented alarm-list surface.',
            },
        ],
        expected_behavior: 'Render chat output with the alarm summary heading, all metric sections, and a provenance footer.',
        anti_pattern: 'Drop one of the metric sections or answer with free-form prose that is not tied to the canonical renderer.',
    },
    {
        id: 'OF-3',
        type: 'output_contract',
        title: 'Spreadsheet export returns a file-backed scope view',
        user_intent: 'Run report-spreadsheet-export on a valid alarm-list view model.',
        expected_skill: 'report-spreadsheet-export',
        not_skills: [
            {
                skill: 'scada-alarm-list',
                reason: 'The export path must come from the dedicated presentation skill.',
            },
        ],
        expected_behavior: 'Return a scope_view with metadata.export_path, csv metadata, and a real file containing headers, rows, and provenance.',
        anti_pattern: 'Inline CSV content into the response or omit the export path metadata.',
    },
    {
        id: 'EF-1',
        type: 'edge_case',
        title: 'Zero alarms still return a valid summary',
        user_intent: 'Run scada-alarm-summary for a scope and time range with no alarms.',
        expected_skill: 'scada-alarm-summary',
        not_skills: [
            {
                skill: 'scada-alarm-list',
                reason: 'The zero-result case still belongs to the summary contract.',
            },
        ],
        expected_behavior: 'Return zeroed metrics, empty arrays, complete status, and an empty_result warning instead of throwing.',
        anti_pattern: 'Treat no alarms as an error or return null metrics.',
    },
    {
        id: 'EF-2',
        type: 'edge_case',
        title: 'Single alarm produces sane percentages and no chatter',
        user_intent: 'Run scada-alarm-summary on a period with exactly one alarm.',
        expected_skill: 'scada-alarm-summary',
        not_skills: [
            {
                skill: 'scada-alarm-list',
                reason: 'The edge behavior is about computed analytics, not row retrieval.',
            },
        ],
        expected_behavior: 'Return one total alarm, a positive hourly rate, one top offender at 100%, no flood, and no chattering alarms.',
        anti_pattern: 'Divide by zero, produce percentages above 100, or misclassify one alarm as a flood or chatter.',
    },
    {
        id: 'EF-3',
        type: 'edge_case',
        title: 'Safety limit truncation is explicit',
        user_intent: 'Run scada-alarm-summary on a broad range that would exceed 10,000 alarms.',
        expected_skill: 'scada-alarm-summary',
        not_skills: [
            {
                skill: 'scada-alarm-list',
                reason: 'The safety-limit rule is part of the summary fetcher behavior.',
            },
        ],
        expected_behavior: 'Stop at 10,000 alarms, mark completeness partial, emit a safety_limit warning, and report fetched-count metadata.',
        anti_pattern: 'Fetch unbounded alarm pages or claim the result is complete after truncation.',
    },
    {
        id: 'EF-4',
        type: 'edge_case',
        title: 'Long ranges split into 30-day windows',
        user_intent: 'Run scada-alarm-summary across a 45-day window.',
        expected_skill: 'scada-alarm-summary',
        not_skills: [
            {
                skill: 'scada-alarm-list',
                reason: 'The summary skill owns the long-range fetch and merge semantics here.',
            },
        ],
        expected_behavior: 'Split the time range into <=30-day windows, merge and dedupe alarms, and emit a window_split warning.',
        anti_pattern: 'Attempt one oversized alarm query or silently ignore part of the requested range.',
    },
    {
        id: 'EF-5',
        type: 'edge_case',
        title: 'DST boundaries preserve explicit timezone semantics',
        user_intent: 'Run scada-alarm-summary across a daylight-saving boundary with an explicit timezone.',
        expected_skill: 'scada-alarm-summary',
        not_skills: [
            {
                skill: 'scada-period-aggregates',
                reason: 'The edge case is about alarm-summary time resolution, not numeric bucket aggregates.',
            },
        ],
        expected_behavior: 'Honor the explicit timezone in provenance and compute the summary over the resolved real time range without crashing.',
        anti_pattern: 'Ignore the requested timezone or produce malformed provenance around the DST boundary.',
    },
    {
        id: 'EF-6',
        type: 'edge_case',
        title: 'Empty exports still create a usable CSV',
        user_intent: 'Run report-spreadsheet-export on an empty alarm-list view model.',
        expected_skill: 'report-spreadsheet-export',
        not_skills: [
            {
                skill: 'scada-alarm-list',
                reason: 'The export behavior belongs to the presentation layer, even when the source data is empty.',
            },
        ],
        expected_behavior: 'Create a CSV with headers plus warnings and provenance, and return the export file metadata normally.',
        anti_pattern: 'Fail export because the source block has no rows or invent a fake data row.',
    },
    {
        id: 'EF-7',
        type: 'edge_case',
        title: 'Alarm summary exports become sectioned CSV output',
        user_intent: 'Run report-spreadsheet-export on an alarm_summary view model.',
        expected_skill: 'report-spreadsheet-export',
        not_skills: [
            {
                skill: 'scada-alarm-summary',
                reason: 'The summary data already exists; the export step should only serialize it.',
            },
        ],
        expected_behavior: 'Serialize alarm-summary overview, offenders, flood periods, standing alarms, and chattering sections into one CSV.',
        anti_pattern: 'Flatten the summary into an unreadable blob or drop the multi-section structure.',
    },
    {
        id: 'EF-8',
        type: 'edge_case',
        title: 'Alarm summary tolerates documented parameter aliases',
        user_intent: 'Run scada-alarm-summary with aliases such as range and scope_folder.',
        expected_skill: 'scada-alarm-summary',
        not_skills: [
            {
                skill: 'scada-object-explore',
                reason: 'Alias-tolerant retry behavior should still land on the summary skill directly.',
            },
        ],
        expected_behavior: 'Normalize supported alias forms into canonical scope, time, and options without rejecting the request.',
        anti_pattern: 'Fail a retry payload that only uses documented alias keys.',
    },
    {
        id: 'EF-9',
        type: 'edge_case',
        title: 'Standing alarms use the dedicated 30-day lookback',
        user_intent: 'Run scada-alarm-summary on a short main range where a standing alarm started days earlier.',
        expected_skill: 'scada-alarm-summary',
        not_skills: [
            {
                skill: 'scada-alarm-list',
                reason: 'The standing-alarm lookback rule is a summary-specific analytic behavior.',
            },
        ],
        expected_behavior: 'Fetch active alarms over a separate 30-day lookback or reuse the main fetch only when the main range already covers that window.',
        anti_pattern: 'Compute standing alarms only from the user-requested short main range and miss older active alarms.',
    },
];
//# sourceMappingURL=m2-fixtures.js.map
