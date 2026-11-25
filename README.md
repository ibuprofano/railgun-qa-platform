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
- **Environments:** managed in Project Settings. Stored credentials use envelope encryption and are revealed through an audited action.
- **Projects:** a project switcher, and workspace settings.
- **Activity and Trash:** the project's activity log, filterable by type, and a trash with restore and a 30-day purge.
- **Dashboards:**
  - an Overview with the Health Score and its components, KPIs, trend charts over 7, 15, 30 or 90 days, top failing tests and urgent bugs
  - a dashboard on the Test Cases, Executions and Bugs screens
  - daily Health Score history
- **PDF reports:**
  - the Bugs, Executions and Test Cases dashboards, with the same figures, ranges and filters as the screen
  - generated in the background, then downloaded; each download is logged

Not built yet:
- invitations and members
- image attachments
- the Overview PDF and the per-execution HTML/PDF report
- object storage (reports are stored in Postgres for now)
- the automated execution engine
- deployment

## Stack

A monorepo (npm workspaces) with:

- **Web:** Next.js, Tailwind and shadcn/ui, TanStack Query
- **API:** NestJS
- **Database:** PostgreSQL 16 with RLS
- **Jobs:** Graphile Worker
- **Reports:** pdfmake, with charts drawn as SVG once for both the screen and the PDF
- **Identity:** Clerk

Each choice is recorded in an ADR under [docs/adr/](docs/adr/).

## Reviewing the submission

The Clerk keys of the review app and a demo login are sent privately, with the submission. With them, and Node.js ≥ 22.18 and Docker running:

1. `npm install`
2. `npm run setup`, pasting the two Clerk keys when asked
3. `npm run dev`
4. Open http://localhost:3000 and sign in as the demo user. If Clerk asks for a verification code, it's `424242`: the demo email is a Clerk test address (`+clerk_test`), so no email is sent and that code always works.
5. Load the demo data: `npm run db:seed -w apps/api -- --email <demo user's email>`, then reload the page.

## Run it locally

Requirements:

- Node.js ≥ 22.18
- Docker, running
- a Clerk application (a development one is enough), for its publishable and secret keys

```bash
npm install
npm run setup   # asks for your two Clerk keys once, then does the rest
npm run dev     # API on :3001, web on :3000, background worker
```

`npm run setup`:

- starts Postgres on localhost:5433 with the database roles
- writes `apps/api/.env` and `apps/web/.env.local`, and generates `SECRETS_MASTER_KEY`. It never replaces the key once set: stored passwords are encrypted under it.
- applies the migrations and checks RLS coverage
- downloads and verifies the report fonts

It's safe to run again: it keeps every value already set and skips what's done. It only migrates an empty database; see [CLAUDE.md](CLAUDE.md) for adding newer migrations to an existing one.

Sign up at http://localhost:3000. Your first sign-in creates your workspace and project. Then, for demo data:

```bash
npm run db:seed -w apps/api -- --email you@example.com
```

To check quality, run `npm run lint`, `npm run typecheck` and `npm test -w apps/api|apps/worker|apps/web|packages/reporting`. The API and worker tests use the docker-compose database, and the API tests also need `SECRETS_MASTER_KEY` set in the shell, since tests don't read `.env`.

## Documentation

- [Video walkthrough](docs/captures/QA%20Automation%20Platform%20-%20Google%20Chrome%202026-11-25%2019-51-06.mp4): a recorded walkthrough of the app, in [docs/captures/](docs/captures/).
- [PRD.md](PRD.md): the full product specification.
- [docs/adr/](docs/adr/): architecture decisions. Start with ADR 0001.
- [docs/roadmap-full.md](docs/roadmap-full.md): what has been built and what's next, slice by slice. [docs/open-questions.md](docs/open-questions.md) lists what's still undecided.
- [openspec/](openspec/): specs per capability and the archived change proposals (spec-driven development with OpenSpec).
- [CLAUDE.md](CLAUDE.md): every command and environment variable in detail.
- [readme-GR.md](readme-GR.md) and [prompts-GR.md](prompts-GR.md): the course submission write-up and prompt log, in Spanish.
