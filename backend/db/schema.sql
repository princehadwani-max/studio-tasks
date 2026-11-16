-- Studio Tasks — schema
-- Roles: admin, MD, manager, sales manager, designer, operation_coordinator, export_coordinator

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone         VARCHAR(20)  NOT NULL DEFAULT '',
  role          VARCHAR(30)  NOT NULL CHECK (role IN ('admin', 'MD', 'manager', 'sales manager', 'sales_manager', 'designer', 'operation_coordinator', 'export coordinator', 'export_coordinator')),
  role_label    VARCHAR(50)  NOT NULL, -- e.g. "Admin", "Designer 1", "Operation Coordinator 2"
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Safe to re-run against an existing database: adds the column and updates role check constraint
ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20) NOT NULL DEFAULT '';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
  role IN ('admin', 'MD', 'manager', 'sales manager', 'sales_manager', 'designer', 'operation_coordinator', 'export coordinator', 'export_coordinator')
);

CREATE TABLE IF NOT EXISTS tasks (
  id            SERIAL PRIMARY KEY,
  code          VARCHAR(12)  NOT NULL UNIQUE, -- e.g. TSK-0001
  title         VARCHAR(255) NOT NULL,
  description   TEXT,
  assigned_to   INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by   INTEGER      NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  task_date     DATE         NOT NULL DEFAULT CURRENT_DATE,
  status        VARCHAR(20)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  priority      VARCHAR(10)  NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  completion_note TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_date ON tasks (assigned_to, task_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);

-- sequence-backed human friendly codes
CREATE SEQUENCE IF NOT EXISTS task_code_seq START 1;

-- Daily & Monthly routine tasks assigned to employees and managers
CREATE TABLE IF NOT EXISTS routine_tasks (
  id                SERIAL PRIMARY KEY,
  title             VARCHAR(255) NOT NULL,
  description       TEXT,
  frequency         VARCHAR(20)  NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'monthly')),
  assigned_to       INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by       INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  last_completed_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routine_tasks_assigned_to ON routine_tasks (assigned_to, frequency);

-- Task remarks shared by any team member regarding a task
CREATE TABLE IF NOT EXISTS task_remarks (
  id         SERIAL PRIMARY KEY,
  task_id    INTEGER      NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  remark     TEXT         NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_remarks_task_id ON task_remarks (task_id, created_at);
