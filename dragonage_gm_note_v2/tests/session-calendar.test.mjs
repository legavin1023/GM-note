import {test} from 'node:test';
import assert from 'node:assert/strict';
import {koreanDate,calendarDays,shiftMonth,monthRange} from '../src/services/sessionCalendar.mjs';
test('calendar uses Korea dates, leap days and correct year transitions',()=>{
 assert.equal(koreanDate('2026-10-06T15:00:00Z'),'2026-10-07');
 assert.equal(shiftMonth('2026-12',1),'2027-01');
 assert.equal(shiftMonth('2026-01',-1),'2025-12');
 const days=calendarDays('2024-02');assert.equal(days.length,42);
 assert.equal(days.filter(day=>day.inMonth).length,29);
 assert.equal(new Date(days[0].key).getUTCDay(),0);
 assert.deepEqual(monthRange('2026-10'),{start:'2026-09-30T15:00:00.000Z',end:'2026-10-31T15:00:00.000Z'});
});
