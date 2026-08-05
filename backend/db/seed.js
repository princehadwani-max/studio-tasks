// Seeds the team roster and the first task, exactly as scoped in the brief.
// Safe to re-run: it upserts users by username and skips the sample task if
// a task with the same code already exists.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const DEFAULT_PASSWORD = 'studio123'; // ⚠ change after first login — see README

const USERS = [
  { name: 'Deep',     username: 'deep',     role: 'manager',              role_label: 'Manager' },
  { name: 'Hardeek',  username: 'hardeek',  role: 'designer',             role_label: 'Designer 1' },
  { name: 'Yogesh',   username: 'yogesh',   role: 'designer',             role_label: 'Designer 2' },
  { name: 'Kamlesh',  username: 'kamlesh',  role: 'operation_coordinator', role_label: 'Operation Coordinator 1' },
  { name: 'Swati',    username: 'swati',    role: 'operation_coordinator', role_label: 'Operation Coordinator 2' },
  { name: 'Hasumati', username: 'hasumati', role: 'operation_coordinator', role_label: 'Operation Coordinator 3' },
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  try {
    const idByUsername = {};

    for (const u of USERS) {
      const res = await pool.query(
        `INSERT INTO users (name, username, password_hash, role, role_label)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (username) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, role_label = EXCLUDED.role_label
         RETURNING id, username`,
        [u.name, u.username, passwordHash, u.role, u.role_label]
      );
      idByUsername[res.rows[0].username] = res.rows[0].id;
    }
    console.log('✔ Users seeded:', Object.keys(idByUsername).join(', '));

    const existing = await pool.query(`SELECT id FROM tasks WHERE code = 'TSK-0001'`);
    if (existing.rowCount === 0) {
      const { rows } = await pool.query(
        `INSERT INTO tasks (code, title, description, assigned_to, assigned_by, task_date, status, priority)
         VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 'pending', 'high')
         RETURNING id, code`,
        [
          'TSK-0001',
          'Arrange raw footage of flute session from Sfumato',
          'Pull in and organize the raw data from the flute shoot with Sfumato. Majorly video shots — sort by scene/take, label files clearly, and flag anything unusable.',
          idByUsername['swati'],
          idByUsername['deep'],
        ]
      );
      console.log(`✔ Sample task seeded: ${rows[0].code} → Swati`);
    } else {
      console.log('… Sample task TSK-0001 already exists, skipping.');
    }

    // Keep the code sequence ahead of any manually-numbered seed tasks above.
    await pool.query(`SELECT setval('task_code_seq', 1, true)`);

    console.log(`\nAll seeded accounts share the password: "${DEFAULT_PASSWORD}"`);
    console.log('Please change these after first login (see README).');
  } catch (err) {
    console.error('✘ Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
