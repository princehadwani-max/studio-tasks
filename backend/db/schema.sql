-- Studio Tasks — Multi-Tenant Schema
-- Roles: super_admin (platform owner), admin (company admin), MD, manager, sales manager, designer, operation_coordinator, export_coordinator

CREATE TABLE IF NOT EXISTS companies (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  slug       VARCHAR(60)  NOT NULL UNIQUE,
  active     BOOLEAN      NOT NULL DEFAULT true,
  features   JSONB        NOT NULL DEFAULT '{"whatsapp": true, "routines": true, "remarks": true, "team_management": true}'::jsonb,
  task_seq   INTEGER      NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Ensure the initial tenant company (id = 1: Starco Ceramics) exists for existing data
INSERT INTO companies (id, name, slug, active, task_seq)
VALUES (1, 'Starco Ceramics', 'starco', true, 1)
ON CONFLICT (id) DO UPDATE SET name = 'Starco Ceramics', slug = 'starco';

SELECT setval('companies_id_seq', GREATEST((SELECT COALESCE(MAX(id), 1) FROM companies), 1), true);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER      REFERENCES companies(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  username      VARCHAR(50)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone         VARCHAR(20)  NOT NULL DEFAULT '',
  role          VARCHAR(30)  NOT NULL CHECK (role IN ('super_admin', 'admin', 'MD', 'manager', 'sales manager', 'sales_manager', 'designer', 'operation_coordinator', 'export coordinator', 'export_coordinator')),
  role_label    VARCHAR(50)  NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Safe to re-run against an existing database: adds columns and updates constraints without data loss
ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INTEGER DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE users ALTER COLUMN company_id DROP NOT NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
  role IN ('super_admin', 'admin', 'MD', 'manager', 'sales manager', 'sales_manager', 'designer', 'operation_coordinator', 'export coordinator', 'export_coordinator')
);

-- Promote Prince to Ultimate Super Admin detached from any specific tenant (company_id = NULL)
UPDATE users SET role = 'super_admin', role_label = 'Super Admin', company_id = NULL WHERE username = 'prince';

-- Scope username uniqueness per company (using COALESCE(company_id, 0) for platform-level super_admin)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
DROP INDEX IF EXISTS idx_users_company_username;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_company_username ON users (COALESCE(company_id, 0), username);
CREATE INDEX IF NOT EXISTS idx_users_company_id ON users (company_id);

CREATE TABLE IF NOT EXISTS tasks (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER      NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE,
  code            VARCHAR(12)  NOT NULL, -- e.g. TSK-0001 (unique per company)
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  assigned_to     INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by     INTEGER      NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  task_date       DATE         NOT NULL DEFAULT CURRENT_DATE,
  status          VARCHAR(20)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  priority        VARCHAR(10)  NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  completion_note TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_interval_days INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_reminder_sent_date DATE;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_company_code ON tasks (company_id, code);
CREATE INDEX IF NOT EXISTS idx_tasks_company_id ON tasks (company_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_date ON tasks (assigned_to, task_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);

-- Sync company #1's task_seq with any existing tasks
UPDATE companies
SET task_seq = GREATEST(
  task_seq,
  COALESCE((SELECT MAX(NULLIF(REGEXP_REPLACE(code, '[^0-9]', '', 'g'), '')::int) FROM tasks WHERE company_id = 1), 1)
)
WHERE id = 1;

-- Legacy sequence kept for compatibility
CREATE SEQUENCE IF NOT EXISTS task_code_seq START 1;

-- Daily & Monthly routine tasks assigned to employees and managers
CREATE TABLE IF NOT EXISTS routine_tasks (
  id                SERIAL PRIMARY KEY,
  company_id        INTEGER      NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE,
  title             VARCHAR(255) NOT NULL,
  description       TEXT,
  frequency         VARCHAR(20)  NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'monthly')),
  assigned_to       INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by       INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  last_completed_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE routine_tasks ADD COLUMN IF NOT EXISTS company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_routine_tasks_company_id ON routine_tasks (company_id);
CREATE INDEX IF NOT EXISTS idx_routine_tasks_assigned_to ON routine_tasks (assigned_to, frequency);

-- Task remarks shared by any team member regarding a task
CREATE TABLE IF NOT EXISTS task_remarks (
  id         SERIAL PRIMARY KEY,
  company_id INTEGER      NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE,
  task_id    INTEGER      NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  remark     TEXT         NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE task_remarks ADD COLUMN IF NOT EXISTS company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_task_remarks_task_id ON task_remarks (task_id, created_at);

-- Web Push Notification device subscriptions per user
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         SERIAL PRIMARY KEY,
  company_id INTEGER      REFERENCES companies(id) ON DELETE CASCADE,
  user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT         NOT NULL UNIQUE,
  p256dh     TEXT         NOT NULL,
  auth       TEXT         NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions (user_id);
