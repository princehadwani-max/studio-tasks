# Studio Tasks

A small internal tool for a creative studio: the manager assigns each team
member their work for the day, and can see — in real time — what's pending,
what's in progress, and what's been wrapped, with a running activity log.

Built with **React (Vite)**, **Node.js + Express**, and **PostgreSQL**.

## Team (seeded on first run)

| Name      | Role                    | Username   |
|-----------|-------------------------|------------|
| Deep      | Manager                 | `deep`     |
| Hardeek   | Designer 1              | `hardeek`  |
| Yogesh    | Designer 2              | `yogesh`   |
| Kamlesh   | Operation Coordinator 1 | `kamlesh`  |
| Swati     | Operation Coordinator 2 | `swati`    |
| Hasumati  | Operation Coordinator 3 | `hasumati` |

Everyone shares the password **`studio123`** after seeding — change it (see
[Changing passwords](#changing-passwords) below) before using this for real.

The seed also creates the first task, exactly as scoped:

> **TSK-0001** → assigned to **Swati** — *"Arrange raw footage of flute
> session from Sfumato. Majorly video shots — sort by scene/take, label
> files clearly, and flag anything unusable."*

## What it does

- **Manager (Deep)** signs in and sees:
  - A **roster sidebar** with everyone's progress for the day at a glance
  - A **board** (Pending / In Progress / Completed) for the whole team or
    filtered to one person
  - An **Assign work** form to hand a new task to anyone, with a title,
    details, date, and priority
  - An **Activity log** — a running, timestamped feed of who started or
    finished what, throughout the day
- **Designers & Operation Coordinators** sign in and see:
  - Their own **call sheet** for the day
  - A button to **start** a task, then **mark it done** with an optional
    note describing what was completed
  - A running list of what they've **completed today**

Everyone only ever sees and edits their own tasks; only the manager can
assign tasks or view the whole team's board.

## Project structure

```
studio-tasks/
├── backend/            Node.js + Express API
│   ├── db/
│   │   ├── schema.sql   Table definitions
│   │   ├── migrate.js   Applies schema.sql
│   │   └── seed.js      Seeds the team + first task
│   └── src/
│       ├── server.js
│       ├── db.js
│       ├── middleware/auth.js
│       ├── controllers/
│       └── routes/
└── frontend/            React (Vite) app
    └── src/
        ├── api/client.js
        ├── context/AuthContext.jsx
        ├── pages/          LoginPage, ManagerDashboard, EmployeeDashboard
        ├── components/
        └── styles/index.css
```

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ running locally (or a connection string to one)

## 1. Set up the database

```bash
createdb studio_tasks
```

(Or, using psql: `psql -c "CREATE DATABASE studio_tasks;"`)

## 2. Backend

```bash
cd backend
cp .env.example .env
```

Edit `.env` if your Postgres isn't on the default local port/credentials,
and set `JWT_SECRET` to a long random string:

```
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/studio_tasks
JWT_SECRET=change_this_to_a_long_random_string
CORS_ORIGIN=http://localhost:5173
```

Then:

```bash
npm install
npm run migrate   # creates the tables
npm run seed      # seeds the team + TSK-0001
npm start         # runs on http://localhost:4000
```

Use `npm run dev` instead of `npm start` to auto-restart on file changes.

## 3. Frontend

In a second terminal:

```bash
cd frontend
cp .env.example .env   # points the app at the API above
npm install
npm run dev            # runs on http://localhost:5173
```

Open **http://localhost:5173** and sign in as any of the seeded usernames
(password `studio123`). Try `deep` for the manager view, or `swati` to see
and complete TSK-0001.

## Changing passwords

There's no self-service "change password" screen yet — the fastest way to
set real passwords is to edit `backend/db/seed.js`, replace
`DEFAULT_PASSWORD`, and re-run `npm run seed` (it upserts by username, so
existing users get updated in place). For a production rollout, you'd want
to add a proper "change my password" endpoint before handing out real
accounts.

## API overview

All routes are under `/api` and (except `/auth/login`) require
`Authorization: Bearer <token>`.

| Method | Route                | Who          | What                                  |
|--------|-----------------------|--------------|----------------------------------------|
| POST   | `/auth/login`          | anyone       | Sign in, get a token                   |
| GET    | `/auth/me`             | any signed-in | Current user                          |
| GET    | `/users`               | any signed-in | Team roster                           |
| GET    | `/tasks?date=&userId=&status=` | any signed-in | List tasks (non-managers are forced to their own) |
| POST   | `/tasks`               | manager only | Assign a new task                      |
| PATCH  | `/tasks/:id/status`    | assignee or manager | Move a task to pending/in_progress/completed, with an optional note |
| GET    | `/tasks/summary?date=` | manager only | Per-person counts for the roster sidebar |
| GET    | `/tasks/activity?date=`| manager only | Chronological feed of started/completed work |

## Notes on scope / what to harden before real-world use

This is a working first version, sized for a 6-person team:

- Passwords are hashed (bcrypt) and sessions use JWTs, but there's no
  password-reset flow yet.
- There's no task editing/deleting or reassignment once created — only
  status changes.
- The activity log and board are scoped to a single day at a time (you can
  navigate to past days with the date picker to see history).
- Concurrency is simple last-write-wins — fine for a small team, not built
  for high-volume use.
