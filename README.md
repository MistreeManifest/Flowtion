# Flowtion

**A breathing AI workspace where conversation becomes living visual artifacts.**

Flowtion is an experimental creative tool built around a biological metaphor: every user message triggers a *breathing cycle* that inhales context, extracts semantic meaning, casts a visual artifact, and exhales reflection. Artifacts aren't replaced between turns -- they *evolve*, preserving their visual DNA while reshaping around new intent.

> Live demo: [flowtion-awrpd7yh.manus.space](https://flowtion-awrpd7yh.manus.space/)

---

## How It Works

When you send a message, Flowtion runs a four-phase breathing cycle:

```
idle  -->  inhale  -->  delta  -->  cast  -->  exhale  -->  idle
```

| Phase | What Happens |
|-------|-------------|
| **Inhale** | Gathers conversation context -- recent messages, thread history |
| **Delta** | LLM extracts structured meaning: intent, emotion, archetype, visual intent, semantic tags |
| **Cast** | LLM generates (or *evolves*) an HTML artifact from the delta. If a previous artifact exists, it reshapes it rather than starting fresh |
| **Exhale** | Logs breath metadata (duration, depth, stall detection), saves the assistant summary, returns to idle |

The frontend mirrors this state machine in real time through a polling hook, driving an organic breathing indicator that pulses through each phase with spring-based animation.

### Artifact Evolution

The core design principle: **artifacts evolve, they don't reset.** On the first breath, a new visual form is created. On every subsequent breath in the same thread, the previous artifact is passed as context to the LLM with instructions to preserve structural elements, color families, and spatial relationships while layering in new intent. The result is a visual conversation where you can watch an idea grow.

---

## Architecture

```
flowtion/
+-- client/                   React 19 frontend (Vite)
|   +-- src/
|       +-- components/       BreathingIndicator, UI library (shadcn/ui)
|       +-- hooks/            useBreathingState (polls backend, interpolates progress)
|       +-- pages/            Home (workspace with thread + artifact split pane)
|       +-- lib/              tRPC client, utilities
|       +-- contexts/         Theme provider (dark by default)
|       +-- index.css         Custom design tokens (oklch palette, breathing phase colors)
+-- server/                   Express + tRPC backend
|   +-- breathingCycle.ts     State machine: inhale -> delta -> cast -> exhale
|   +-- routers.ts            tRPC router (flowtion.send, breathingState, threads, artifacts)
|   +-- db.ts                 Drizzle ORM queries (MySQL)
|   +-- _core/                Server infrastructure (LLM client, auth, env, vite middleware)
+-- shared/                   Types shared between client and server
|   +-- breathingTypes.ts     BreathingPhase, BreathingSnapshot, BreathDelta, BreathMetadata
+-- drizzle/                  Database schema and migrations
|   +-- schema.ts             projects, threads, messages, artifact_versions, breath_events
+-- patches/                  pnpm patches (wouter)
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, Tailwind CSS 4, Framer Motion, wouter |
| UI Components | shadcn/ui (Radix primitives), Lucide icons |
| API | tRPC v11 (type-safe RPC over Express) |
| Database | MySQL via Drizzle ORM |
| LLM | OpenAI-compatible API (Gemini 2.5 Flash via Forge proxy) |
| Language | TypeScript 5.9 (strict mode) |
| Testing | Vitest |
| Package Manager | pnpm |

---

## Database Schema

Six tables track the full lifecycle of every breath:

- **`users`** -- OAuth users (optional; workspace works without auth)
- **`projects`** -- Top-level containers, one per conversation origin
- **`threads`** -- Conversation threads within a project
- **`messages`** -- User and assistant messages with role + timestamp
- **`artifact_versions`** -- Versioned HTML artifacts with semantic metadata (tags, embedding source text, composite version)
- **`breath_events`** -- Telemetry for each breathing cycle (inhale duration, cast stall detection, exhale type, cycle depth)

Migrations are managed by Drizzle Kit and live in `drizzle/`.

---

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **pnpm** (the project specifies `pnpm@10.4.1` in `packageManager`)
- **MySQL** database
- An **OpenAI-compatible LLM API** key (or the Forge API credentials used by the Manus scaffold)

### Environment Variables

Create a `.env` file in the project root:

```env
# Database
DATABASE_URL=mysql://user:password@localhost:3306/flowtion

# LLM (OpenAI-compatible endpoint)
BUILT_IN_FORGE_API_URL=https://your-llm-endpoint.com
BUILT_IN_FORGE_API_KEY=your-api-key

# Auth (optional -- workspace works without these)
VITE_APP_ID=your-app-id
JWT_SECRET=your-jwt-secret
OAUTH_SERVER_URL=https://your-oauth-server.com
OWNER_OPEN_ID=your-open-id

# Server
PORT=3000
```

### Install & Run

```bash
# Install dependencies
pnpm install

# Push database schema (generates and runs migrations)
pnpm db:push

# Start development server (Express + Vite HMR)
pnpm dev

# Open http://localhost:3000
```

### Build for Production

```bash
# Build client (Vite) and server (esbuild)
pnpm build

# Start production server
pnpm start
```

### Run Tests

```bash
pnpm test
```

Nine tests cover the breathing cycle state machine and tRPC endpoint wiring (snapshot shape, public/authenticated access, input validation).

---

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server with Vite HMR and tsx watch |
| `pnpm build` | Production build (Vite client + esbuild server) |
| `pnpm start` | Run production server |
| `pnpm check` | TypeScript type check (no emit) |
| `pnpm format` | Prettier formatting |
| `pnpm test` | Run Vitest test suite |
| `pnpm db:push` | Generate and run Drizzle migrations |

---

## Design Notes

### Visual Language

The UI uses a deep dark palette built on oklch color space with custom design tokens for each breathing phase:

- **Inhale** -- cool blue (`oklch(0.65 0.12 220)`)
- **Delta** -- emerald green (`oklch(0.7 0.14 160)`)
- **Cast** -- warm amber (`oklch(0.72 0.16 55)`)
- **Exhale** -- soft violet (`oklch(0.6 0.1 300)`)

The breathing indicator uses spring-based animation (Framer Motion) with sine-wave oscillation for an organic, living feel. No linear transitions.

### State Mirroring

The backend breathing cycle is a singleton state machine driven by an EventEmitter. The frontend mirrors it via `useBreathingState`, which polls every 500ms and locally interpolates progress between polls using `requestAnimationFrame` for smooth 60fps animation even with network latency.

### No Auth Gate

Authentication infrastructure exists (OAuth, JWT cookies, user table) but the workspace loads directly without a login screen. All tRPC procedures under `flowtion.*` are public. This is intentional for the current phase -- frictionless first experience.

---

## Current Status

This is **Phase 1: The Heartbeat with Memory**. The breathing cycle, artifact evolution, conversation threading, and visual state mirroring are all functional. See `todo.md` for the completed checklist.

---

## License

MIT
