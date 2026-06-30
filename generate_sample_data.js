const fs = require('fs');
const path = require('path');

const dbFilePath = path.join(__dirname, 'backend', 'db.json');

if (!fs.existsSync(dbFilePath)) {
  console.error('db.json not found!');
  process.exit(1);
}

const dbData = JSON.parse(fs.readFileSync(dbFilePath, 'utf8'));

// Generate 22 reports from 2026-06-01 to 2026-06-22
const reports = [];
let opening_dg = 300; // Start with a safe high number

for (let i = 1; i <= 22; i++) {
  const dayStr = i < 10 ? `0${i}` : `${i}`;
  const dateStr = `2026-06-${dayStr}`;
  
  // Rules:
  // 1. new_dg_requests = new_dg_completed_today_itself + new_dg_moved_to_follow_up
  // 2. closing_dg = opening_dg - total_dg_completed_today
  // 3. All numbers non-negative
  
  const op = 50 + Math.floor(Math.random() * 20); // 50 to 69
  const req = 20 + Math.floor(Math.random() * 10); // 20 to 29
  const today = 10 + Math.floor(Math.random() * 5); // 10 to 14
  const follow = req - today; // Rule 1 satisfied
  const completed = 8 + Math.floor(Math.random() * 5); // 8 to 12 completed (so closing dg goes down slowly)
  const closing_dg = opening_dg - completed; // Rule 2 satisfied

  reports.push({
    id: i,
    report_date: dateStr,
    opening_dg,
    number_of_op: op,
    new_dg_requests: req,
    total_dg_completed_today: completed,
    new_dg_completed_today_itself: today,
    new_dg_moved_to_follow_up: follow,
    closing_dg,
    created_at: new Date(`2026-06-${dayStr}T16:00:00.000Z`).toISOString(),
    updated_at: new Date(`2026-06-${dayStr}T16:00:00.000Z`).toISOString()
  });

  opening_dg = closing_dg; // carry over
}

dbData.reports = reports;

fs.writeFileSync(dbFilePath, JSON.stringify(dbData, null, 2), 'utf8');
console.log('Successfully generated 22 daily reports in db.json!');
