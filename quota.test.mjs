import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatQuota, parseQuota, renderBar } from './quota.ts';

test('reports remaining quota and reset for both windows', () => {
  const quota = parseQuota({ rate_limit: {
    primary_window: { used_percent: 44, limit_window_seconds: 18000, reset_at: 1800000000 },
    secondary_window: { used_percent: 8, limit_window_seconds: 604800, reset_at: 1800500000 },
  } });
  assert.deepEqual(quota.fiveHour, { remainingPercent: 56, resetAt: 1800000000000 });
  assert.deepEqual(quota.weekly, { remainingPercent: 92, resetAt: 1800500000000 });
  assert.match(formatQuota(quota), /5-hour: 56% left/);
  assert.match(formatQuota(quota), /Weekly: 92% left/);
});

test('a single weekly primary window is not presented as 5-hour', () => {
  const quota = parseQuota({ rate_limit: {
    primary_window: { used_percent: 1, limit_window_seconds: 604800 }, secondary_window: null,
  } });
  assert.equal(quota.fiveHour, undefined);
  assert.equal(quota.weekly?.remainingPercent, 99);
  assert.match(formatQuota(quota), /5-hour: not reported by OpenAI/);
});

test('accepts legacy remaining percentages and reset timestamps', () => {
  const quota = parseQuota({ rate_limits: {
    five_hour: { percent_left: 70.5, reset_time_ms: 1800000000000 },
    weekly: { percent_left: 20, reset_at: '2027-01-01T00:00:00Z' },
  } });
  assert.equal(quota.fiveHour?.remainingPercent, 70.5);
  assert.equal(quota.fiveHour?.resetAt, 1800000000000);
  assert.equal(quota.weekly?.resetAt, Date.parse('2027-01-01T00:00:00Z'));
});

test('progress bars show remaining quota at narrow and wide widths', () => {
  assert.deepEqual(renderBar(0, 10), { filled: '', empty: '░'.repeat(10) });
  assert.deepEqual(renderBar(50, 10), { filled: '█████', empty: '░░░░░' });
  assert.deepEqual(renderBar(100, 10), { filled: '█'.repeat(10), empty: '' });
  assert.deepEqual(renderBar(1, 5), { filled: '█', empty: '░░░░' });
  assert.deepEqual(renderBar(91, 0), { filled: '', empty: '' });
});

test('rejects empty and malformed quota responses', () => {
  for (const body of [{}, { rate_limit: { primary_window: null } }, { rate_limit: {
    primary_window: { used_percent: 101 },
  } }]) assert.throws(() => parseQuota(body), /rate-limit windows/);
});
