// ====== ՓՈՐՁԱՐԿՄԱՆ ՌԵԺԻՄ ======
const OVERRIDE = false;                // կոնկրետ օր ընտրելու համար դիր true
const OVERRIDE_START = '2026-10-14';   // ո՞ր օրվա 01:00-ից սկսել
// ================================

// «Օրը» 01:00 → հաջորդ օրվա 01:00 (Երևանի ժամով), ինչպես կայքում և բոտում.
// կեսգիշերից հետո (00:00–01:00) սկսվող խաղերը պատկանում են նախորդ երեկոյին։
const zone = 'Asia/Yerevan';
const DAY_START_HOUR = 1;

let start;
if (OVERRIDE) {
  const [y, m, d] = OVERRIDE_START.split('-').map(Number);
  start = $now.setZone(zone).set({ year: y, month: m, day: d, hour: DAY_START_HOUR, minute: 0, second: 0, millisecond: 0 });
} else {
  start = $now.setZone(zone).minus({ hours: DAY_START_HOUR }).startOf('day').plus({ hours: DAY_START_HOUR });
}
const end = start.plus({ days: 1 });
const w = { windowStart: start.toMillis(), windowEnd: end.toMillis() };

// միջակայքը անցնում է կեսգիշերով՝ խաղերը վերցնում ենք երկու օրացուցային օրից (2 API հարցում)
return [
  { json: { date: start.toFormat('yyyy-MM-dd'), ...w } },
  { json: { date: end.toFormat('yyyy-MM-dd'), ...w } },
];
