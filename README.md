# Railgun QA Platform

A multi-tenant web app for QA teams. It brings test cases, test runs, bugs and quality reporting into one place.

- Teams write test cases in Gherkin or as manual steps and organize them in folders and tags.
- They run them in batched **executions** with a defined lifecycle.
- Failing runs can file bugs automatically.

This is the final project of the AI4Devs course (LIDR), by Gonzalo Roland. **It is a work in progress:** the MVP is complete, and later phases are being built slice by slice.

## What works today

- **Tenant isolation:**
  - forced Postgres row-level security behind every query
  - two-level roles: workspace Owner/Collaborator and project Admin/Contributor/Viewer
  - an append-only activity log, written in the same transaction as each change
- **Test cases:** a four-level folder tree with drag and drop, a Gherkin editor, and tags.
- **Executions:**
  - Draft → Ready → In Progress ⇄ Paused → Completed → Done, or Canceled
  - a live timer and manual outcomes
  - Try Again: Restart with attempt history, or Duplicate
  - a history panel and live updates over server-sent events
- **Bugs:** severity and status, a snapshot of the run that found the bug, auto-creation when a run fails, and tags.
- **Environments:** stored credentials use envelope encryption and are revealed through an audited action.
- **Projects:** a project switcher, a trash with restore, and a daily purge job.

Not built yet: invitations, image attachments, dashboards, PDF/HTML reports, and the automated execution engine.

## Stack

A monorepo (npm workspaces) with:

- **Web:** Next.js, Tailwind and shadcn/ui, TanStack Query
- **API:** NestJS
- **Database:** PostgreSQL 16 with RLS
- **Jobs:** Graphile Worker
- **Identity:** Clerk

Each choice is recorded in an ADR under [docs/adr/](docs/adr/).

## Run it locally

Requirements:

- Node.js ≥ 22.18
- Docker
- a Clerk development application, for its publishable and secret keys

```bash
npm install
docker compose up -d   # Postgres on localhost:5433, with the database roles

DATABASE_URL=postgresql://railgun_migrator:migrator_dev_password@localhost:5433/railgun npm run db:migrate
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/railgun npm run db:check-rls
```

Then set the environment variables:

- `apps/api/.env`: copy it from `apps/api/.env.example`, then set `CLERK_SECRET_KEY` and `SECRETS_MASTER_KEY` (`openssl rand -base64 32`).
- `apps/web/.env.local`: set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and the same `CLERK_SECRET_KEY`.

```bash
npm run dev   # API on :3001, web on :3000, background worker
```

Sign up at http://localhost:3000. Your first sign-in creates your workspace and project. Then load the demo data:

```bash
npm run db:seed -w apps/api -- --email you@example.com
```

To check quality, run `npm run lint`, `npm run typecheck` and `npm test -w apps/api|apps/worker|apps/web`. The API and worker tests use the docker-compose database.

## Documentation

- [PRD.md](PRD.md): the full product specification.
- [docs/adr/](docs/adr/): architecture decisions. Start with ADR 0001.
- [docs/roadmap-full.md](docs/roadmap-full.md): what has been built and what's next, slice by slice. [docs/open-questions.md](docs/open-questions.md) lists what's still undecided.
- [openspec/](openspec/): specs per capability and the archived change proposals (spec-driven development with OpenSpec).
- [CLAUDE.md](CLAUDE.md): every command and environment variable in detail.
- [readme-GR.md](readme-GR.md) and [prompts-GR.md](prompts-GR.md): the course submission write-up and prompt log, in Spanish.
