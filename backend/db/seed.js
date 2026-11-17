// Seeds the team roster and the first task, exactly as scoped in the brief.
// Safe to re-run: it upserts users by username and skips the sample task if
// a task with the same code already exists.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const DEFAULT_PASSWORD = 'studio123'; // ⚠ change after first login — see README

const USERS = [
  { name: 'Prince', username: 'prince', phone: '9510194671', role: 'super_admin', role_label: 'Super Admin' },
  { name: 'Deep', username: 'deep', phone: '9876543202', role: 'manager', role_label: 'Manager' },
  { name: 'JayBhai', username: 'jaybhai', phone: '9876543203', role: 'MD', role_label: 'MD' },
  { name: 'Rutvik', username: 'rutvik', phone: '9876543204', role: 'sales manager', role_label: 'Sales Manager 1' },
  { name: 'Milan P', username: 'milan.p', phone: '9876543205', role: 'sales manager', role_label: 'Sales Manager 2' },
  { name: 'Sujit', username: 'sujit', phone: '9876543206', role: 'sales manager', role_label: 'Sales Manager 3' },
  { name: 'Milan U', username: 'milan.u', phone: '9876543207', role: 'sales manager', role_label: 'Sales Manager 4' },

  { name: 'Divyraj', username: 'divyraj', phone: '9876543208', role: 'export_coordinator', role_label: 'Export Coordinator 1' },
  { name: 'Harshal', username: 'harshal', phone: '9876543209', role: 'export_coordinator', role_label: 'Export Coordinator 2' },

  { name: 'Hardeek', username: 'hardeek', phone: '9876543210', role: 'designer', role_label: 'Designer 1' },
  { name: 'Yogesh', username: 'yogesh', phone: '9876543211', role: 'designer', role_label: 'Designer 2' },
  { name: 'Kamlesh', username: 'kamlesh', phone: '9876543212', role: 'operation_coordinator', role_label: 'Operation Coordinator 1' },
  { name: 'Swati', username: 'swati', phone: '9876543213', role: 'operation_coordinator', role_label: 'Operation Coordinator 2' },
  { name: 'Hasumati', username: 'hasumati', phone: '9876543214', role: 'operation_coordinator', role_label: 'Operation Coordinator 3' },
  { name: 'Vidhi', username: 'vidhi', phone: '9876543215', role: 'operation_coordinator', role_label: 'Operation Coordinator 4' },
  { name: 'Kishan', username: 'kishan', phone: '9876543216', role: 'operation_coordinator', role_label: 'Operation Coordinator 5' },
  { name: 'Raj', username: 'raj', phone: '9876543217', role: 'operation_coordinator', role_label: 'Operation Coordinator 6' },
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  try {
    // Ensure tenant company #1 (Starco Ceramics) exists
    const companyRes = await pool.query(
      `INSERT INTO companies (id, name, slug, active)
       VALUES (1, 'Starco Ceramics', 'starco', true)
       ON CONFLICT (id) DO UPDATE SET name = 'Starco Ceramics', slug = 'starco'
       RETURNING id`
    );
    const defaultCompanyId = companyRes.rows[0].id;

    // Normalize any legacy uppercase/spaced usernames before upserting
    await pool.query(`
      UPDATE users
      SET username = LOWER(REPLACE(TRIM(username), ' ', '.'))
      WHERE username != LOWER(REPLACE(TRIM(username), ' ', '.'))
        AND NOT EXISTS (
          SELECT 1 FROM users u2
          WHERE COALESCE(u2.company_id, 0) = COALESCE(users.company_id, 0)
            AND u2.username = LOWER(REPLACE(TRIM(users.username), ' ', '.'))
            AND u2.id != users.id
        )
    `);

    const idByUsername = {};

    for (const u of USERS) {
      const targetCompanyId = u.role === 'super_admin' ? null : defaultCompanyId;
      const existingUser = await pool.query(
        `SELECT id FROM users WHERE username = $1 AND COALESCE(company_id, 0) = COALESCE($2::int, 0)`,
        [u.username, targetCompanyId]
      );

      let res;
      if (existingUser.rowCount > 0) {
        res = await pool.query(
          `UPDATE users
           SET name = $1,
               company_id = $2,
               phone = CASE WHEN users.phone IS NULL OR users.phone = '' THEN $3 ELSE users.phone END,
               role = $4,
               role_label = $5,
               active = true
           WHERE id = $6
           RETURNING id, username`,
          [u.name, targetCompanyId, u.phone, u.role, u.role_label, existingUser.rows[0].id]
        );
      } else {
        res = await pool.query(
          `INSERT INTO users (company_id, name, username, password_hash, phone, role, role_label, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true)
           RETURNING id, username`,
          [targetCompanyId, u.name, u.username, passwordHash, u.phone, u.role, u.role_label]
        );
      }
      idByUsername[res.rows[0].username] = res.rows[0].id;
    }
    console.log('✔ Users seeded:', Object.keys(idByUsername).join(', '));

    const existing = await pool.query(
      `SELECT id FROM tasks WHERE company_id = $1 AND code = 'TSK-0001'`,
      [defaultCompanyId]
    );
    if (existing.rowCount === 0) {
      const { rows } = await pool.query(
        `INSERT INTO tasks (company_id, code, title, description, assigned_to, assigned_by, task_date, status, priority)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, 'pending', 'high')
         RETURNING id, code`,
        [
          defaultCompanyId,
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

    // Keep the code sequence ahead of any existing tasks in the database.
    await pool.query(`
      SELECT setval(
        'task_code_seq',
        GREATEST(
          COALESCE((SELECT MAX( NULLIF(REGEXP_REPLACE(code, '[^0-9]', '', 'g'), '')::int ) FROM tasks), 1),
          1
        ),
        true
      )
    `);

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
