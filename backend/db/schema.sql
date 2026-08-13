-- Studio Tasks — schema
-- Roles: manager (admin), designer, operation_coordinator

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(30)  NOT NULL CHECK (role IN ('MD', 'manager', 'sales manager', 'designer', 'operation_coordinator', 'export coordinator')),
  role_label    VARCHAR(50)  NOT NULL, -- e.g. "Designer 1", "Operation Coordinator 2"
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Safe to re-run against an existing database: adds the column if this is
-- an upgrade from a version of the schema that predates roster management.

ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

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
