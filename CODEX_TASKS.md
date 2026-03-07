# Codex Task Specs for Flowtion

> These are precise, file-level specs for Codex. Each task is self-contained.
> Do them in order. Do NOT improvise beyond what's described.
> If something is ambiguous, skip it and leave a comment — don't guess.

---

## CRITICAL RULES

1. **Do not delete or rename files unless the spec says to.**
2. **Do not refactor code that isn't mentioned in the spec.**
3. **Run `npx vitest run` after each task. All 9 tests must still pass.**
4. **Run `npx tsc --noEmit` after each task. Zero errors.**
5. **Commit after each task with a descriptive message.**
6. **The project uses: TypeScript 5.9, React 19, tRPC v11, Drizzle ORM, Vite 7, Express 4.**
7. **Package manager is pnpm, but npm with `--legacy-peer-deps` works in this environment.**

---

## Task 1: Decouple from Manus-specific infrastructure

### Goal
Replace Manus-specific LLM proxy, Vite plugins, and OAuth with standard
OpenAI-compatible configuration. Flowtion should work with any OpenAI-compatible
API (OpenAI, Anthropic via proxy, Ollama, etc.) using standard env vars.

### Files to modify

#### `server/_core/env.ts`
Replace the current contents with:

```ts
export const ENV = {
  // LLM — any OpenAI-compatible endpoint
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o",

  // Database
  databaseUrl: process.env.DATABASE_URL ?? "",

  // Server
  isProduction: process.env.NODE_ENV === "production",
  port: parseInt(process.env.PORT ?? "3000"),
};
```

#### `server/_core/llm.ts`
Two changes only:

1. Change `resolveApiUrl` to use the new env vars:
```ts
const resolveApiUrl = () =>
  `${ENV.openaiBaseUrl.replace(/\/$/, "")}/v1/chat/completions`;
```

2. Change `assertApiKey` to check the new key:
```ts
const assertApiKey = () => {
  if (!ENV.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};
```

3. In the `invokeLLM` function, change the model and auth header:
   - Replace `model: "gemini-2.5-flash"` with `model: ENV.openaiModel`
   - Replace `authorization: \`Bearer ${ENV.forgeApiKey}\`` with `authorization: \`Bearer ${ENV.openaiApiKey}\``

4. **Remove** the `thinking` property from the payload:
```ts
// DELETE these lines:
payload.thinking = {
  "budget_tokens": 128
}
```
(This is Gemini-specific. Standard OpenAI API doesn't support it.)

**Do NOT change anything else in llm.ts.** The message normalization, tool choice
handling, response format handling — all of that is OpenAI-compatible already.

#### `vite.config.ts`
1. Remove the import of `vitePluginManusRuntime` and `jsxLocPlugin`
2. Remove those plugins from the `plugins` array
3. Remove the entire `vitePluginManusDebugCollector` function and its helpers
4. The plugins array should become: `[react(), tailwindcss()]`
5. Remove the `allowedHosts` array from `server` config (or replace with `true`)
6. Keep everything else (resolve aliases, build config, etc.)

#### `server/_core/context.ts`
Replace `sdk.authenticateRequest` with a simple null return (auth is unused):
```ts
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  // Auth is not used — all procedures are public.
  // This can be extended later if auth is needed.
  return {
    req: opts.req,
    res: opts.res,
    user: null,
  };
}
```

#### `server/_core/index.ts`
Remove the line `registerOAuthRoutes(app);` and its import.
The OAuth callback route is Manus-specific and unused.

#### `server/storage.ts`
This file uses the Forge proxy for storage. It's not used anywhere in the
breathing cycle or artifact system. **Leave it alone for now** — but add a
comment at the top:
```ts
// TODO: This storage module uses the old Manus Forge proxy.
// It is not currently used by any active feature.
// Replace with S3/R2/local storage when file uploads are needed.
```

### Files to NOT touch
- `server/_core/sdk.ts` — leave it, it's only imported by context.ts which we're replacing
- `server/_core/oauth.ts` — leave it, we're just not calling it anymore
- `server/_core/cookies.ts` — leave it, harmless
- `client/src/_core/hooks/useAuth.ts` — leave it, it handles the "no auth" case gracefully
- `client/src/const.ts` — leave it
- `shared/const.ts` — leave it

### Environment
Update `README.md` env section to show the new vars:
```env
# LLM (any OpenAI-compatible API)
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com    # or http://localhost:11434 for Ollama
OPENAI_MODEL=gpt-4o                        # or llama3, etc.

# Database
DATABASE_URL=mysql://user:password@localhost:3306/flowtion

# Server
PORT=3000
```

Remove the old Manus env vars (BUILT_IN_FORGE_API_URL, BUILT_IN_FORGE_API_KEY,
VITE_APP_ID, JWT_SECRET, OAUTH_SERVER_URL, OWNER_OPEN_ID) from the README.

### Verification
- `npx tsc --noEmit` — zero errors
- `npx vitest run` — all 9 tests pass
- The app should start with `OPENAI_API_KEY` and `DATABASE_URL` set

---

## Task 2: SSE for breathing state (replace polling)

### Goal
Replace the 500ms polling of `flowtion.breathingState` with Server-Sent Events.
The backend already has an EventEmitter (`onBreathingEvent`). Wire it to an SSE
endpoint. The frontend replaces polling with an EventSource.

### Files to modify

#### `server/_core/index.ts`
Add a new SSE endpoint BEFORE the tRPC middleware:

```ts
// SSE endpoint for breathing state
app.get("/api/breathing-stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Send current state immediately
  const snapshot = getBreathingSnapshot();
  res.write(`data: ${JSON.stringify(snapshot)}\n\n`);

  // Forward breathing events as SSE
  const unsubscribe = onBreathingEvent(() => {
    const snapshot = getBreathingSnapshot();
    res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
  });

  // Heartbeat every 15s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15000);

  req.on("close", () => {
    unsubscribe();
    clearInterval(heartbeat);
  });
});
```

Import `getBreathingSnapshot` and `onBreathingEvent` from `../breathingCycle`.

#### `client/src/hooks/useBreathingState.ts`
Replace the tRPC polling with an EventSource connection:

```ts
import { useState, useEffect, useRef } from "react";
import type { BreathingState, BreathingSnapshot } from "../../../shared/breathingTypes";

export interface BreathingStateHook {
  state: BreathingState;
  progress: number;
  isBreathing: boolean;
  projectId: number | null;
  threadId: number | null;
}

export function useBreathingState(): BreathingStateHook {
  const [state, setState] = useState<BreathingState>("idle");
  const [progress, setProgress] = useState(0);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [threadId, setThreadId] = useState<number | null>(null);
  const animationRef = useRef<number | null>(null);
  const phaseStartRef = useRef<number>(Date.now());

  // SSE connection to breathing state stream
  useEffect(() => {
    const es = new EventSource("/api/breathing-stream");

    es.onmessage = (event) => {
      try {
        const snapshot: BreathingSnapshot = JSON.parse(event.data);

        if (snapshot.state !== state) {
          setState(snapshot.state);
          phaseStartRef.current = Date.now();
          setProgress(0);
        }

        setProjectId(snapshot.projectId);
        setThreadId(snapshot.threadId);
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects. No action needed.
    };

    return () => es.close();
  }, []);  // Note: intentionally empty deps — we read state inside via closure

  // Local animation interpolation (unchanged from original)
  useEffect(() => {
    if (state === "idle") {
      setProgress(0);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const typicalDurations: Record<string, number> = {
      inhale: 2000,
      delta: 3000,
      cast: 8000,
      exhale: 2000,
    };

    const typical = typicalDurations[state] ?? 3000;

    const animate = () => {
      const elapsed = Date.now() - phaseStartRef.current;
      const p = Math.min(elapsed / typical, 0.99);
      setProgress(p);
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [state]);

  return {
    state,
    progress,
    isBreathing: state !== "idle",
    projectId,
    threadId,
  };
}
```

**Important:** This hook no longer imports or uses tRPC. It's a pure EventSource hook.
The `state` dependency in the SSE effect is intentionally excluded from deps
because we check it inside the handler.

#### `server/routers.ts`
The `breathingState` query can stay — it doesn't hurt anything and the tests use it.
Don't remove it.

### Verification
- `npx tsc --noEmit` — zero errors
- `npx vitest run` — all 9 tests pass (the tRPC breathingState test still works)
- When a breath is triggered, the frontend should update in real-time without polling

---

## Task 3: Streaming artifact generation during cast phase

### Goal
Stream the LLM response during the cast phase so the artifact appears
progressively instead of all-at-once after 8+ seconds.

This is the most complex task. Read carefully.

### Overview
1. Add a `streamLLM` function to `llm.ts` that returns an async iterable of text chunks
2. The cast phase uses `streamLLM` instead of `invokeLLM`
3. Add an SSE endpoint that streams the artifact HTML as it's generated
4. The frontend `SandboxedArtifact` component updates its `srcdoc` as chunks arrive

### Files to modify

#### `server/_core/llm.ts`
Add a new export `streamLLM` alongside the existing `invokeLLM` (do NOT modify
`invokeLLM` — it's still used by the delta phase which needs the full response):

```ts
export async function* streamLLM(
  params: Omit<InvokeParams, "response_format" | "responseFormat" | "output_schema" | "outputSchema">
): AsyncGenerator<string, void, unknown> {
  assertApiKey();

  const payload: Record<string, unknown> = {
    model: ENV.openaiModel,
    messages: params.messages.map(normalizeMessage),
    stream: true,
    max_tokens: 32768,
  };

  const response = await fetch(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.openaiApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM stream failed: ${response.status} ${response.statusText} – ${errorText}`);
  }

  if (!response.body) {
    throw new Error("LLM stream: no response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") return;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch {
        // Skip malformed SSE lines
      }
    }
  }
}
```

#### `server/breathingCycle.ts`
In the `executeCycle` function, replace the cast phase's `invokeLLM` call
with `streamLLM`. Import `streamLLM` from `./_core/llm`.

Replace this section (inside the cast try/catch):
```ts
const castResponse = await invokeLLM({ ... });
const rawCastContent = castResponse.choices[0].message.content;
const rawContent = typeof rawCastContent === "string" ? rawCastContent : "";
artifactHtml = rawContent.replace(/```html\n?/g, "").replace(/```\n?/g, "").trim();
```

With:
```ts
let rawContent = "";
for await (const chunk of streamLLM({
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPromptParts.join("\n") },
  ],
})) {
  rawContent += chunk;
  // Emit partial artifact for streaming consumers
  emit({
    type: "CAST_STREAMING" as any,
    projectId,
    threadId,
    partialHtml: rawContent.replace(/```html\n?/g, "").replace(/```\n?/g, "").trim(),
  });
}
artifactHtml = rawContent.replace(/```html\n?/g, "").replace(/```\n?/g, "").trim();
```

#### `shared/breathingTypes.ts`
Add the streaming event type to `BreathingEvent`:
```ts
export type BreathingEvent =
  | { type: "PHASE_CHANGED"; phase: BreathingPhase; projectId: number; threadId: number }
  | { type: "CYCLE_COMPLETE"; projectId: number; threadId: number; metadata: BreathMetadata }
  | { type: "CYCLE_ERROR"; projectId: number; threadId: number; error: string }
  | { type: "CAST_STREAMING"; projectId: number; threadId: number; partialHtml: string };
```

#### `server/_core/index.ts`
Modify the SSE endpoint to also forward CAST_STREAMING events:

In the `onBreathingEvent` handler, check the event type. For CAST_STREAMING
events, send them as a named event:

```ts
const unsubscribe = onBreathingEvent((event) => {
  if (event.type === "CAST_STREAMING") {
    res.write(`event: artifact-stream\ndata: ${JSON.stringify({ html: event.partialHtml })}\n\n`);
  } else {
    const snapshot = getBreathingSnapshot();
    res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
  }
});
```

Note: `onBreathingEvent` handler now receives the event object. Update the
import to also get the event. The callback signature is already
`(event: BreathingEvent) => void` — we just need to use the parameter.

#### `client/src/hooks/useBreathingState.ts`
Add a `streamingHtml` field to the hook return type and state:

```ts
export interface BreathingStateHook {
  state: BreathingState;
  progress: number;
  isBreathing: boolean;
  projectId: number | null;
  threadId: number | null;
  streamingHtml: string | null;
}
```

In the SSE effect, listen for the named `artifact-stream` event:

```ts
es.addEventListener("artifact-stream", (event) => {
  try {
    const data = JSON.parse(event.data);
    setStreamingHtml(data.html);
  } catch {}
});
```

Reset `streamingHtml` to null when state changes to "idle" or "exhale".

#### `client/src/pages/Home.tsx`
Pass `breathing.streamingHtml` to the `ArtifactPane`.
When `streamingHtml` is not null and the breathing state is "cast", show a
live-updating `SandboxedArtifact` with the partial HTML above the history
timeline. When breathing completes, the regular artifact query refetches
and shows the final version.

### Verification
- `npx tsc --noEmit` — zero errors
- `npx vitest run` — all tests pass
- During a breathing cycle, the artifact should progressively appear during cast phase

---

## Task 4: Define Drizzle relations

### Goal
Fill in `drizzle/relations.ts` with proper Drizzle relation definitions.

### File to modify

#### `drizzle/relations.ts`
```ts
import { relations } from "drizzle-orm";
import {
  users,
  projects,
  threads,
  messages,
  artifactVersions,
  breathEvents,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  threads: many(threads),
  artifactVersions: many(artifactVersions),
  breathEvents: many(breathEvents),
}));

export const threadsRelations = relations(threads, ({ one, many }) => ({
  project: one(projects, { fields: [threads.projectId], references: [projects.id] }),
  messages: many(messages),
  artifactVersions: many(artifactVersions),
  breathEvents: many(breathEvents),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  thread: one(threads, { fields: [messages.threadId], references: [threads.id] }),
}));

export const artifactVersionsRelations = relations(artifactVersions, ({ one }) => ({
  project: one(projects, { fields: [artifactVersions.projectId], references: [projects.id] }),
  thread: one(threads, { fields: [artifactVersions.threadId], references: [threads.id] }),
}));

export const breathEventsRelations = relations(breathEvents, ({ one }) => ({
  project: one(projects, { fields: [breathEvents.projectId], references: [projects.id] }),
  thread: one(threads, { fields: [breathEvents.threadId], references: [threads.id] }),
}));
```

### Verification
- `npx tsc --noEmit` — zero errors
- `npx vitest run` — all tests pass
