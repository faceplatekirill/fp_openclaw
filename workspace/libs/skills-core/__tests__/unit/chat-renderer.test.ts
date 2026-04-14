import assert from 'assert';
import { renderChatMarkdown } from '../../dist/index.js';

const sampleViewModel = {
  kind: 'history_view',
  blocks: [
    {
      block_kind: 'history',
      tag: '/root/FP/PROJECT/POINT_A:value',
      label: 'Point A',
      unit: 'kV',
      data: [
        [1741435200000, 110.1],
        [1741435500000, 110.4],
      ],
      last_change: 1741435500000,
      notes: ['Change-driven archive: gaps mean the value stayed unchanged.'],
    },
  ],
  warnings: [
    {
      severity: 'warning',
      message: 'One requested tag was not archived and is omitted from the history blocks.',
    },
  ],
  provenance: {
    source_skill: 'scada-point-history',
    scope: '/root/FP/PROJECT/POINT_A:value',
    period_from: 1741435200000,
    period_to: 1741438800000,
    timezone: 'Europe/Vilnius',
    produced_at: 1741438860000,
  },
  completeness: {
    status: 'partial',
    reason: '1 of 2 requested tags resolved successfully.',
    total_available: 2,
    total_returned: 1,
  },
};

const tests = [
  {
    name: 'Renderer includes blocks, warnings, completeness, and provenance in order',
    run: () => {
      const markdown = renderChatMarkdown(sampleViewModel as any);

      const historyIndex = markdown.indexOf('### Point A');
      const warningsIndex = markdown.indexOf('## Warnings');
      const completenessIndex = markdown.indexOf('## Completeness');
      const provenanceIndex = markdown.indexOf('Source: scada-point-history');

      assert.ok(historyIndex >= 0);
      assert.ok(warningsIndex > historyIndex);
      assert.ok(completenessIndex > warningsIndex);
      assert.ok(provenanceIndex > completenessIndex);
      assert.ok(markdown.includes('Europe/Vilnius'));
      assert.ok(markdown.includes('Last change:'));
    },
  },
  {
    name: 'Renderer truncates long history tables using the canonical thresholds',
    run: () => {
      const markdown = renderChatMarkdown({
        ...sampleViewModel,
        warnings: [],
        completeness: {
          status: 'complete',
        },
        blocks: [
          {
            block_kind: 'history',
            tag: '/root/FP/PROJECT/POINT_A:value',
            data: Array.from({ length: 25 }, (_, index) => [
              1741435200000 + index * 60_000,
              index,
            ]),
          },
        ],
      } as any);

      assert.ok(markdown.includes('Showing 15 of 25 points.'));
      assert.ok(markdown.includes('| ... | ... |'));
    },
  },
  {
    name: 'Renderer includes coverage entry notes for data-quality style coverage views',
    run: () => {
      const markdown = renderChatMarkdown({
        kind: 'coverage_view',
        blocks: [
          {
            block_kind: 'coverage',
            entries: [
              {
                tag: '/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220/L2831/P:out_value',
                archived: true,
                notes: [
                  'Archive available: /root/ARCHIVE/L2831/P/out_value',
                  'Current value: 116.51',
                  'Current quality: out_qds = 0',
                  'Last archive change in requested window: 1773754503000',
                ],
              },
            ],
            summary: {
              total: 1,
              archived: 1,
              not_archived: 0,
              invalid: 0,
            },
          },
        ],
        warnings: [],
        provenance: {
          source_skill: 'scada-data-quality',
          scope: '/root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220/L2831/P:out_value',
          period_from: 1773668103000,
          period_to: 1773754503000,
          timezone: 'UTC',
          produced_at: 1773754503000,
        },
        completeness: {
          status: 'complete',
        },
      } as any);

      assert.ok(markdown.includes('#### /root/FP/PROJECT/KAZ/AKMOLA/AKMOLA/220/L2831/P:out_value'));
      assert.ok(markdown.includes('Current value: 116.51'));
      assert.ok(markdown.includes('Current quality: out_qds = 0'));
      assert.ok(markdown.includes('Last archive change in requested window: 1773754503000'));
    },
  },
];

async function runTests() {
  let passed = 0;
  let failed = 0;

  for (let index = 0; index < tests.length; index += 1) {
    const test = tests[index];
    try {
      await test.run();
      passed += 1;
      console.log(`PASS ${index + 1}: ${test.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${index + 1}: ${test.name}`);
      console.error(error);
    }
  }

  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch((error) => {
  console.error('Test suite error:', error);
  process.exit(1);
});
