const { Pool, Client } = require('pg');
const { URL } = require('url');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/dg_tracker';
let pool;
let dbMode = 'pg'; // 'pg' or 'json'

const dbFilePath = path.join(__dirname, 'db.json');

// Helper to read JSON DB
function readDb() {
  try {
    if (fs.existsSync(dbFilePath)) {
      const content = fs.readFileSync(dbFilePath, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('Error reading JSON db:', err);
  }
  return { users: [], reports: [] };
}

// Helper to write JSON DB
function writeDb(data) {
  try {
    fs.writeFileSync(dbFilePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing JSON db:', err);
  }
}

// Check if database exists, create it, and setup tables.
async function initDatabase() {
  try {
    const parsed = new URL(dbUrl);
    const targetDb = parsed.pathname.substring(1) || 'dg_tracker';

    // 1. Connect to postgres system database to create target DB if not exists
    parsed.pathname = '/postgres';
    const systemDbUrl = parsed.toString();
    
    console.log('Attempting to connect to PostgreSQL...');
    const systemClient = new Client({ connectionString: systemDbUrl });
    await systemClient.connect();
    
    const checkDb = await systemClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDb]);
    if (checkDb.rowCount === 0) {
      console.log(`Database "${targetDb}" not found. Creating database...`);
      await systemClient.query(`CREATE DATABASE "${targetDb}"`);
      console.log(`Database "${targetDb}" created.`);
    }
    await systemClient.end().catch(() => {});

    // 2. Initialize the Pool for target database
    pool = new Pool({ connectionString: dbUrl });

    // 3. Create tables if they do not exist
    const client = await pool.connect();
    await client.query('BEGIN');

    // Create Users table (temporary schema check)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Alter users table to add branch and constraint
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS branch VARCHAR(100)');
    await client.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
    await client.query("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('Employee', 'Manager', 'Team Lead'))");

    // Create Daily Reports table
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_reports (
        id SERIAL PRIMARY KEY,
        report_date DATE NOT NULL,
        opening_dg INTEGER NOT NULL CHECK (opening_dg >= 0),
        number_of_op INTEGER NOT NULL CHECK (number_of_op >= 0),
        new_dg_requests INTEGER NOT NULL CHECK (new_dg_requests >= 0),
        total_dg_completed_today INTEGER NOT NULL CHECK (total_dg_completed_today >= 0),
        new_dg_completed_today_itself INTEGER NOT NULL CHECK (new_dg_completed_today_itself >= 0),
        new_dg_moved_to_follow_up INTEGER NOT NULL CHECK (new_dg_moved_to_follow_up >= 0),
        closing_dg INTEGER NOT NULL CHECK (closing_dg >= 0),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Alter daily_reports table to add branch and constraint
    await client.query('ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS branch VARCHAR(100)');
    await client.query('ALTER TABLE daily_reports DROP CONSTRAINT IF EXISTS daily_reports_report_date_key');
    await client.query('ALTER TABLE daily_reports DROP CONSTRAINT IF EXISTS daily_reports_report_date_branch_key');
    await client.query('ALTER TABLE daily_reports ADD CONSTRAINT daily_reports_report_date_branch_key UNIQUE (report_date, branch)');
    await client.query("UPDATE daily_reports SET branch = 'Tambaram' WHERE branch IS NULL");

    // Insert Default Accounts
    const usersToSeed = [
      { email: 'tambaram', password: 'tambaram123', role: 'Employee', name: 'Tambaram Employee', branch: 'Tambaram' },
      { email: 'omr', password: 'omr123', role: 'Employee', name: 'OMR Employee', branch: 'OMR' },
      { email: 'ecr', password: 'ecr123', role: 'Employee', name: 'ECR Employee', branch: 'ECR' },
      { email: 'manager', password: 'manager123', role: 'Manager', name: 'System Manager', branch: null }
    ];

    for (const u of usersToSeed) {
      const checkUser = await client.query('SELECT id FROM users WHERE email = $1', [u.email]);
      if (checkUser.rowCount === 0) {
        const hash = await bcrypt.hash(u.password, 10);
        await client.query(
          'INSERT INTO users (email, password_hash, role, name, branch) VALUES ($1, $2, $3, $4, $5)',
          [u.email, hash, u.role, u.name, u.branch]
        );
      }
    }

    // Insert Sample Reports if empty
    const checkReports = await client.query('SELECT id FROM daily_reports LIMIT 1');
    if (checkReports.rowCount === 0) {
      console.log('Seeding initial sample reports database logs...');
      const sampleReports = [
        { date: '2026-06-10', op: 45, req: 15, taken: 10, today: 5, follow: 10, open: 100, close: 90, branch: 'Tambaram' },
        { date: '2026-06-11', op: 52, req: 20, taken: 12, today: 8, follow: 12, open: 90, close: 78, branch: 'Tambaram' },
        { date: '2026-06-12', op: 48, req: 18, taken: 15, today: 10, follow: 8, open: 78, close: 63, branch: 'Tambaram' },
        { date: '2026-06-13', op: 60, req: 25, taken: 18, today: 15, follow: 10, open: 63, close: 45, branch: 'Tambaram' },
        { date: '2026-06-14', op: 35, req: 10, taken: 8,  today: 6, follow: 4, open: 45, close: 37, branch: 'Tambaram' },
        { date: '2026-06-15', op: 58, req: 30, taken: 20, today: 18, follow: 12, open: 37, close: 17, branch: 'Tambaram' }
      ];
      for (const r of sampleReports) {
        await client.query(
          `INSERT INTO daily_reports (report_date, opening_dg, number_of_op, new_dg_requests, total_dg_completed_today, new_dg_completed_today_itself, new_dg_moved_to_follow_up, closing_dg, branch)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [r.date, r.open, r.op, r.req, r.taken, r.today, r.follow, r.close, r.branch]
        );
      }
    }

    await client.query('COMMIT');
    client.release();
    console.log('PostgreSQL schema initialized successfully.');
  } catch (err) {
    console.log('\n========================================================================');
    console.log(`WARNING: PostgreSQL connection failed (${err.message}).`);
    console.log('Switching to local JSON file database ("db.json") for instant local demo!');
    console.log('========================================================================\n');
    
    dbMode = 'json';
    initializeJsonDb();
  }
}

// Seed mock database file on disk if missing
function initializeJsonDb() {
  let initialData;
  if (!fs.existsSync(dbFilePath)) {
    console.log('Creating initial local db.json database with seeded users & reports...');
    initialData = { users: [], reports: [] };
  } else {
    initialData = readDb();
  }

  // Ensure the 4 new accounts are in the users array
  const usersToSeed = [
    {
      id: 101,
      email: 'tambaram',
      password_hash: '$2a$10$Tlsptwn3tJpppGBsU/bOle/nzlp8Q.D13HuuXwhU2j/sghg9QnDAW', // tambaram123
      role: 'Employee',
      branch: 'Tambaram',
      name: 'Tambaram Employee',
      created_at: new Date().toISOString()
    },
    {
      id: 102,
      email: 'omr',
      password_hash: '$2a$10$MpE6an5zKUoqFSlC8nqs3udJmQoySGZka8B5.9DqY/FqT9xmc1Ona', // omr123
      role: 'Employee',
      branch: 'OMR',
      name: 'OMR Employee',
      created_at: new Date().toISOString()
    },
    {
      id: 103,
      email: 'ecr',
      password_hash: '$2a$10$xcao3LoKmugJ9TM5JeYGUek34m1ZjefoOL84OwhmG7akj1mrnUwgO', // ecr123
      role: 'Employee',
      branch: 'ECR',
      name: 'ECR Employee',
      created_at: new Date().toISOString()
    },
    {
      id: 104,
      email: 'manager',
      password_hash: '$2a$10$czlkNcMjsfSdwNBFqRY/z.Do4WxwtsOuQ8DIVK7ZUuiDt0Kc6SNFu', // manager123
      role: 'Manager',
      branch: null,
      name: 'System Manager',
      created_at: new Date().toISOString()
    }
  ];

  let modified = false;
  if (!initialData.users) initialData.users = [];
  
  for (const u of usersToSeed) {
    const exists = initialData.users.some(existingUser => existingUser.email === u.email);
    if (!exists) {
      initialData.users.push(u);
      modified = true;
    }
  }

  // Ensure existing reports have a branch (default to Tambaram if null/missing)
  if (!initialData.reports) initialData.reports = [];
  initialData.reports.forEach(r => {
    if (!r.branch) {
      r.branch = 'Tambaram';
      modified = true;
    }
  });

  // Seed sample reports if reports array is empty
  if (initialData.reports.length === 0) {
    initialData.reports = [
      { id: 1, report_date: '2026-06-10', opening_dg: 100, number_of_op: 45, new_dg_requests: 15, total_dg_completed_today: 10, new_dg_completed_today_itself: 5, new_dg_moved_to_follow_up: 10, closing_dg: 90, branch: 'Tambaram', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 2, report_date: '2026-06-11', opening_dg: 90, number_of_op: 52, new_dg_requests: 20, total_dg_completed_today: 12, new_dg_completed_today_itself: 8, new_dg_moved_to_follow_up: 12, closing_dg: 78, branch: 'Tambaram', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 3, report_date: '2026-06-12', opening_dg: 78, number_of_op: 48, new_dg_requests: 18, total_dg_completed_today: 15, new_dg_completed_today_itself: 10, new_dg_moved_to_follow_up: 8, closing_dg: 63, branch: 'Tambaram', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 4, report_date: '2026-06-13', opening_dg: 63, number_of_op: 60, new_dg_requests: 25, total_dg_completed_today: 18, new_dg_completed_today_itself: 15, new_dg_moved_to_follow_up: 10, closing_dg: 45, branch: 'Tambaram', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 5, report_date: '2026-06-14', opening_dg: 45, number_of_op: 35, new_dg_requests: 10, total_dg_completed_today: 8, new_dg_completed_today_itself: 6, new_dg_moved_to_follow_up: 4, closing_dg: 37, branch: 'Tambaram', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 6, report_date: '2026-06-15', opening_dg: 37, number_of_op: 58, new_dg_requests: 30, total_dg_completed_today: 20, new_dg_completed_today_itself: 18, new_dg_moved_to_follow_up: 12, closing_dg: 17, branch: 'Tambaram', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    ];
    modified = true;
  }

  if (modified || !fs.existsSync(dbFilePath)) {
    writeDb(initialData);
    console.log('Synchronized seeded users and branches in local db.json.');
  }
}

// SQL Query Emulator for local JSON DB
async function resolveJsonQuery(text, params) {
  const dbData = readDb();
  const sql = text.trim().replace(/\s+/g, ' ');

  // 1. SELECT * FROM users WHERE email = $1
  if (sql.includes('SELECT * FROM users WHERE email =')) {
    const email = params[0].toLowerCase().trim();
    const user = dbData.users.find(u => u.email.toLowerCase() === email);
    return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
  }

  // 2. SELECT id FROM users WHERE email = $1
  if (sql.includes('SELECT id FROM users WHERE email =')) {
    const email = params[0].toLowerCase().trim();
    const user = dbData.users.find(u => u.email.toLowerCase() === email);
    return { rows: user ? [{ id: user.id }] : [], rowCount: user ? 1 : 0 };
  }

  // 3. SELECT * FROM daily_reports WHERE id = $1
  if (sql.includes('SELECT * FROM daily_reports WHERE id =') && !sql.includes('branch')) {
    const id = parseInt(params[0]);
    const report = dbData.reports.find(r => r.id === id);
    return { rows: report ? [report] : [], rowCount: report ? 1 : 0 };
  }

  // 4. SELECT report_date FROM daily_reports WHERE id = $1
  if (sql.includes('SELECT report_date FROM daily_reports WHERE id =')) {
    const id = parseInt(params[0]);
    const report = dbData.reports.find(r => r.id === id);
    return { rows: report ? [{ report_date: new Date(report.report_date) }] : [], rowCount: report ? 1 : 0 };
  }

  // 5. SELECT id FROM daily_reports WHERE report_date = $1 AND branch = $2
  if (sql.includes('SELECT id FROM daily_reports WHERE report_date =') && sql.includes('branch =') && !sql.includes('id !=')) {
    const dateStr = params[0];
    const branchVal = params[1];
    const report = dbData.reports.find(r => r.report_date === dateStr && r.branch === branchVal);
    return { rows: report ? [{ id: report.id }] : [], rowCount: report ? 1 : 0 };
  }

  // 6. SELECT id FROM daily_reports WHERE report_date = $1 AND branch = $2 AND id != $3
  if (sql.includes('SELECT id FROM daily_reports WHERE report_date =') && sql.includes('branch =') && sql.includes('id !=')) {
    const dateStr = params[0];
    const branchVal = params[1];
    const id = parseInt(params[2]);
    const report = dbData.reports.find(r => r.report_date === dateStr && r.branch === branchVal && r.id !== id);
    return { rows: report ? [{ id: report.id }] : [], rowCount: report ? 1 : 0 };
  }

  // 7. SELECT closing_dg FROM daily_reports WHERE branch = $1 AND report_date < $2 ORDER BY report_date DESC LIMIT 1
  if (sql.includes('SELECT closing_dg FROM daily_reports WHERE branch =') && sql.includes('report_date <')) {
    const branchVal = params[0];
    const dateStr = params[1];
    const targetTime = new Date(dateStr).getTime();
    const matches = dbData.reports
      .filter(r => r.branch === branchVal && new Date(r.report_date).getTime() < targetTime)
      .sort((a, b) => new Date(b.report_date).getTime() - new Date(a.report_date).getTime());
    return { rows: matches.length > 0 ? [{ closing_dg: matches[0].closing_dg }] : [], rowCount: matches.length > 0 ? 1 : 0 };
  }

  // 8. SELECT id, report_date, opening_dg ... FROM daily_reports WHERE branch = $1 AND report_date >= $2
  if (sql.includes('SELECT id, report_date, opening_dg') && sql.includes('WHERE branch =') && sql.includes('report_date >=')) {
    const branchVal = params[0];
    const dateStr = params[1];
    const targetTime = new Date(dateStr).getTime();
    const matches = dbData.reports
      .filter(r => r.branch === branchVal && new Date(r.report_date).getTime() >= targetTime)
      .sort((a, b) => new Date(a.report_date).getTime() - new Date(b.report_date).getTime());
    const rows = matches.map(m => ({
      ...m,
      report_date: new Date(m.report_date)
    }));
    return { rows, rowCount: rows.length };
  }

  // 9. INSERT INTO daily_reports (report_date, opening_dg, number_of_op, new_dg_requests, total_dg_completed_today, new_dg_completed_today_itself, new_dg_moved_to_follow_up, closing_dg, branch)
  if (sql.startsWith('INSERT INTO daily_reports')) {
    const [report_date, opening_dg, number_of_op, new_dg_requests, total_dg_completed_today, new_dg_completed_today_itself, new_dg_moved_to_follow_up, closing_dg, branch] = params;
    
    const newId = dbData.reports.reduce((max, r) => r.id > max ? r.id : max, 0) + 1;
    const newReport = {
      id: newId,
      report_date,
      opening_dg: parseInt(opening_dg),
      number_of_op: parseInt(number_of_op),
      new_dg_requests: parseInt(new_dg_requests),
      total_dg_completed_today: parseInt(total_dg_completed_today),
      new_dg_completed_today_itself: parseInt(new_dg_completed_today_itself),
      new_dg_moved_to_follow_up: parseInt(new_dg_moved_to_follow_up),
      closing_dg: parseInt(closing_dg),
      branch: branch,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    dbData.reports.push(newReport);
    writeDb(dbData);
    
    return { rows: [{ ...newReport, report_date: new Date(report_date) }], rowCount: 1 };
  }

  // 10. UPDATE daily_reports SET report_date = $1, number_of_op = $2, new_dg_requests = $3, total_dg_completed_today = $4, new_dg_completed_today_itself = $5, new_dg_moved_to_follow_up = $6, branch = $7 WHERE id = $8
  if (sql.startsWith('UPDATE daily_reports') && sql.includes('number_of_op =') && sql.includes('branch =')) {
    const [report_date, number_of_op, new_dg_requests, total_dg_completed_today, new_dg_completed_today_itself, new_dg_moved_to_follow_up, branch, id] = params;
    const idNum = parseInt(id);
    
    const index = dbData.reports.findIndex(r => r.id === idNum);
    if (index !== -1) {
      dbData.reports[index] = {
        ...dbData.reports[index],
        report_date,
        number_of_op: parseInt(number_of_op),
        new_dg_requests: parseInt(new_dg_requests),
        total_dg_completed_today: parseInt(total_dg_completed_today),
        new_dg_completed_today_itself: parseInt(new_dg_completed_today_itself),
        new_dg_moved_to_follow_up: parseInt(new_dg_moved_to_follow_up),
        branch,
        updated_at: new Date().toISOString()
      };
      writeDb(dbData);
      return { rows: [dbData.reports[index]], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 11. UPDATE daily_reports SET opening_dg = $1, closing_dg = $2 WHERE id = $3
  if (sql.startsWith('UPDATE daily_reports') && (sql.includes('opening_dg =') || sql.includes('open_dg ='))) {
    const [opening_dg, closing_dg, id] = params;
    const idNum = parseInt(id);
    
    const index = dbData.reports.findIndex(r => r.id === idNum);
    if (index !== -1) {
      dbData.reports[index].opening_dg = parseInt(opening_dg);
      dbData.reports[index].closing_dg = parseInt(closing_dg);
      dbData.reports[index].updated_at = new Date().toISOString();
      writeDb(dbData);
      return { rows: [dbData.reports[index]], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 12. DELETE FROM daily_reports WHERE id = $1
  if (sql.startsWith('DELETE FROM daily_reports WHERE id =')) {
    const id = parseInt(params[0]);
    const index = dbData.reports.findIndex(r => r.id === id);
    if (index !== -1) {
      dbData.reports.splice(index, 1);
      writeDb(dbData);
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 13. General SELECT/COUNT query parsing for daily_reports
  if (sql.includes('FROM daily_reports') && (sql.startsWith('SELECT') || sql.startsWith('SELECT COUNT(*)'))) {
    let matches = [...dbData.reports];
    
    // Regex parameter-to-field matching
    const regex = /([a-z_]+)\s*(=|>=|<=|!=)\s*\$(\d+)/gi;
    let match;
    while ((match = regex.exec(sql)) !== null) {
      const col = match[1].toLowerCase();
      const op = match[2];
      const paramIdx = parseInt(match[3]) - 1;
      const paramVal = params[paramIdx];
      
      if (col === 'branch') {
        matches = matches.filter(r => r.branch === paramVal);
      } else if (col === 'report_date') {
        const valTime = new Date(paramVal).getTime();
        if (op === '=') {
          matches = matches.filter(r => r.report_date === paramVal);
        } else if (op === '>=') {
          matches = matches.filter(r => new Date(r.report_date).getTime() >= valTime);
        } else if (op === '<=') {
          matches = matches.filter(r => new Date(r.report_date).getTime() <= valTime);
        }
      } else if (col === 'id') {
        const idVal = parseInt(paramVal);
        if (op === '=') {
          matches = matches.filter(r => r.id === idVal);
        } else if (op === '!=') {
          matches = matches.filter(r => r.id !== idVal);
        }
      }
    }

    if (sql.includes('COUNT(*)')) {
      return { rows: [{ count: matches.length }], rowCount: 1 };
    }

    // Sort order
    if (sql.includes('ORDER BY report_date DESC')) {
      matches.sort((a, b) => new Date(b.report_date).getTime() - new Date(a.report_date).getTime());
    } else if (sql.includes('ORDER BY report_date ASC')) {
      matches.sort((a, b) => new Date(a.report_date).getTime() - new Date(b.report_date).getTime());
    }

    // Limit & Offset
    let limitVal = null;
    let offsetVal = 0;

    const limitMatch = sql.match(/LIMIT\s*\$(\d+)/i);
    const offsetMatch = sql.match(/OFFSET\s*\$(\d+)/i);
    
    if (limitMatch) {
      const idx = parseInt(limitMatch[1]) - 1;
      limitVal = parseInt(params[idx]);
    }
    if (offsetMatch) {
      const idx = parseInt(offsetMatch[1]) - 1;
      offsetVal = parseInt(params[idx]);
    }

    if (limitVal !== null) {
      matches = matches.slice(offsetVal, offsetVal + limitVal);
    }

    const rows = matches.map(m => ({
      ...m,
      report_date: new Date(m.report_date)
    }));

    return { rows, rowCount: rows.length };
  }

  // Mock transaction control queries
  if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) {
    return { rows: [], rowCount: 0 };
  }

  console.warn('Unhandled SQL fallback query:', sql);
  return { rows: [], rowCount: 0 };
}

const mockPool = {
  connect: async () => {
    return {
      query: async (text, params) => resolveJsonQuery(text, params),
      release: () => {}
    };
  },
  query: async (text, params) => resolveJsonQuery(text, params)
};

// Cascade recalculate forward from a specific date.
async function cascadeRecalculate(client, startingDateStr, branch) {
  console.log(`Starting cascade recalculation forward from: ${startingDateStr} for branch: ${branch}`);
  
  const prevRes = await client.query(
    'SELECT closing_dg FROM daily_reports WHERE branch = $1 AND report_date < $2 ORDER BY report_date DESC LIMIT 1',
    [branch, startingDateStr]
  );
  let carryOver = prevRes.rowCount > 0 ? prevRes.rows[0].closing_dg : 0;

  const reportsRes = await client.query(
    'SELECT id, report_date, opening_dg, number_of_op, new_dg_requests, total_dg_completed_today, new_dg_completed_today_itself, new_dg_moved_to_follow_up FROM daily_reports WHERE branch = $1 AND report_date >= $2 ORDER BY report_date ASC',
    [branch, startingDateStr]
  );

  let isFirst = true;
  for (const report of reportsRes.rows) {
    const opening_dg = (isFirst && prevRes.rowCount === 0) ? report.opening_dg : carryOver;
    isFirst = false;
    
    const closing_dg = opening_dg - report.total_dg_completed_today;

    if (closing_dg < 0) {
      throw new Error(`Recalculation error for date ${report.report_date.toISOString().split('T')[0]}: Closing DG (${closing_dg}) cannot be negative. Please adjust Total DG Completed Today (${report.total_dg_completed_today}) or Opening DG (${opening_dg}).`);
    }

    await client.query(
      `UPDATE daily_reports 
       SET opening_dg = $1, closing_dg = $2 
       WHERE id = $3`,
      [opening_dg, closing_dg, report.id]
    );

    carryOver = closing_dg;
  }
  console.log('Cascade recalculation completed successfully.');
}

module.exports = {
  initDatabase,
  query: (text, params) => {
    if (dbMode === 'json') return resolveJsonQuery(text, params);
    return pool.query(text, params);
  },
  getPool: () => {
    if (dbMode === 'json') return mockPool;
    return pool;
  },
  cascadeRecalculate,
};
