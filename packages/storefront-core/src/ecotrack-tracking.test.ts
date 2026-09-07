import { expect, it } from 'vitest';
import { parseEcotrackRemoteDateTime, readEcotrackActivityTimestamp } from './ecotrack-tracking';

it.each([
  ['2026-09-08', '10:30:00', '2026-09-08T09:30:00.000Z'],
  ['2026-09-08 10:30:00', undefined, '2026-09-08T09:30:00.000Z'],
  ['2026-09-08T10:30:00', undefined, '2026-09-08T09:30:00.000Z'],
  ['2026-09-08', '00:30', '2026-09-07T23:30:00.000Z'],
  ['2026-09-08', undefined, '2026-09-07T23:00:00.000Z'],
  ['2026-09-08T10:30:00Z', undefined, '2026-09-08T10:30:00.000Z'],
  ['2026-09-08 10:30:00+0200', undefined, '2026-09-08T08:30:00.000Z'],
  ['2026-09-08', '10:30:00.125+01:00', '2026-09-08T09:30:00.125Z'],
])('parses provider time consistently: %s %s', (date, time, expected) => {
  expect(parseEcotrackRemoteDateTime(date, time)?.toISOString()).toBe(expected);
});
it.each(['2026-02-30', '2026-09-08 25:30:00', '2026-09-08T10:60:00', 'not a date'])(
  'rejects invalid provider time %s',
  (date) => {
    expect(parseEcotrackRemoteDateTime(date)).toBeNull();
  },
);
it('uses the same instant for MAJ and split activity timestamps', () => {
  expect(
    readEcotrackActivityTimestamp({
      tracking: 'TRK-11',
      created_at: '2026-09-08 10:30:00',
      remarque: 'Call',
    }),
  ).toEqual(readEcotrackActivityTimestamp({ date: '2026-09-08', time: '10:30:00' }));
});
