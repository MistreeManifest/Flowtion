import { EventEmitter } from "events";
import type {
  BreathingState,
  BreathingPhase,
  BreathingSnapshot,
  BreathingEvent,
  BreathMetadata,
  BreathDelta,
} from "../shared/breathingTypes";
import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import {
  projects,
  threads,
  messages,
  artifactVersions,
  breathEvents,
} from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

// ─── Constants ───────────────────────────────────────────────────────────────

const CAST_STALL_THRESHOLD_MS = 15_000;

// ─── Singleton State ─────────────────────────────────────────────────────────

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

let currentState: BreathingState = "idle";
let currentProjectId: number | null = null;
let currentThreadId: number | null = null;
let phaseStartedAt: number | null = null;

// ─── Public API ──────────────────────────────────────────────────────────────

export function getBreathingSnapshot(): BreathingSnapshot {
  const now = Date.now();
  let phaseProgress = 0;
  if (phaseStartedAt && currentState !== "idle") {
    // Estimate progress based on typical phase durations
    const elapsed = now - phaseStartedAt;
    const typicalDurations: Record<BreathingPhase, number> = {
      inhale: 2000,
      delta: 3000,
      cast: 8000,
      exhale: 2000,
    };
    const typical = typicalDurations[currentState as BreathingPhase] ?? 3000;
    phaseProgress = Math.min(elapsed / typical, 0.99);
  }

  return {
    state: currentState,
    projectId: currentProjectId,
    threadId: currentThreadId,
    phaseProgress,
    phaseStartedAt,
  };
}

export function onBreathingEvent(handler: (event: BreathingEvent) => void) {
  emitter.on("breathing", handler);
  return () => emitter.off("breathing", handler);
}

/**
 * Initiate a full breathing cycle for a given message.
 * This is the main entry point — it runs the full inhale→delta→cast→exhale sequence.
 */
export async function breathe(
  userId: number,
  text: string,
  existingProjectId?: number,
  existingThreadId?: number
): Promise<{ projectId: number; threadId: number; messageId: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const cycleStartedAt = Date.now();

  // ── Ensure project + thread exist ──────────────────────────────────────
  let projectId = existingProjectId ?? null;
  let threadId = existingThreadId ?? null;

  if (!projectId) {
    const [inserted] = await db
      .insert(projects)
      .values({ userId, title: text.slice(0, 80) })
      .$returningId();
    projectId = inserted.id;
  }

  if (!threadId) {
    const [inserted] = await db
      .insert(threads)
      .values({ projectId, preview: text.slice(0, 120) })
      .$returningId();
    threadId = inserted.id;
  }

  // Save the user message
  const [insertedMsg] = await db
    .insert(messages)
    .values({ threadId, role: "user", text })
    .$returningId();
  const messageId = insertedMsg.id;

  // ── INHALE: Gather context ─────────────────────────────────────────────
  transition("inhale", projectId, threadId);
  const inhaleStart = Date.now();

  // Fetch recent messages for context
  const recentMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(desc(messages.createdAt))
    .limit(10);

  const conversationContext = recentMessages
    .reverse()
    .map((m) => `${m.role}: ${m.text}`)
    .join("\n");

  const inhaleDurationMs = Date.now() - inhaleStart;

  // ── DELTA: Extract intent, emotion, archetype ──────────────────────────
  transition("delta", projectId, threadId);

  let delta: BreathDelta;
  try {
    const deltaResponse = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are the delta phase of a breathing cycle. Analyze the conversation and extract the user's intent, emotional tone, archetypal pattern, and visual intent. Respond ONLY with valid JSON matching this schema:
{
  "intent": "string — what the user wants to create or explore",
  "emotion": "string — the dominant emotional tone (e.g. wonder, urgency, calm, tension)",
  "archetype": "string — the mythic archetype at play (e.g. Creator, Explorer, Sage, Rebel, Caregiver)",
  "visualIntent": "string — what visual form this should take",
  "tags": ["array", "of", "semantic", "tags"]
}`,
        },
        {
          role: "user",
          content: `Conversation context:\n${conversationContext}\n\nLatest message: ${text}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "breath_delta",
          strict: true,
          schema: {
            type: "object",
            properties: {
              intent: { type: "string" },
              emotion: { type: "string" },
              archetype: { type: "string" },
              visualIntent: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
            },
            required: ["intent", "emotion", "archetype", "visualIntent", "tags"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawDelta = deltaResponse.choices[0].message.content;
    const deltaContent = typeof rawDelta === "string" ? rawDelta : "{}";
    const parsed = JSON.parse(deltaContent);
    delta = {
      intent: parsed.intent ?? text,
      emotion: parsed.emotion ?? "neutral",
      archetype: parsed.archetype ?? "Creator",
      visualIntent: parsed.visualIntent ?? "abstract form",
      tags: parsed.tags ?? [],
    };
  } catch (err) {
    console.warn("[BreathingCycle] Delta extraction failed, using fallback:", err);
    delta = {
      intent: text,
      emotion: "neutral",
      archetype: "Creator",
      visualIntent: "abstract form",
      tags: [],
    };
  }

  // Compute cycle depth from delta richness
  const cycleDepth = Math.min(
    5,
    1 + delta.tags.length + (delta.emotion !== "neutral" ? 1 : 0) + (delta.archetype !== "Creator" ? 1 : 0)
  );

  // ── CAST: Generate artifact ────────────────────────────────────────────
  transition("cast", projectId, threadId);
  const castStart = Date.now();

  // Fetch the previous artifact for evolution context
  const previousArtifacts = await db
    .select()
    .from(artifactVersions)
    .where(and(eq(artifactVersions.projectId, projectId), eq(artifactVersions.threadId, threadId)))
    .orderBy(desc(artifactVersions.v))
    .limit(1);

  const previousArtifact = previousArtifacts[0] ?? null;

  // Build the system prompt — evolution-aware
  const isEvolution = previousArtifact !== null;
  const systemPrompt = isEvolution
    ? `You are the cast phase of a breathing cycle. You EVOLVE existing visual artifacts.
You have been given the previous artifact (v${previousArtifact.v}) and a new delta. Your job is to evolve the artifact — not replace it.

Evolution rules:
- The new artifact should feel like a natural progression of the previous one
- Preserve the visual DNA: keep structural elements, color families, and spatial relationships that work
- Layer in the new intent, emotion, and archetype — let them reshape and grow the existing form
- The evolution should be visible: a viewer should see both continuity and change
- Output ONLY the HTML content (no markdown fences, no explanation)
- Use inline CSS for all styling
- Keep it self-contained (no external resources)
- Include a brief text summary at the end as a comment: <!-- SUMMARY: ... -->`
    : `You are the cast phase of a breathing cycle. You transform intent into visual form.
Given the extracted delta (intent, emotion, archetype, visual intent), generate an HTML artifact that visually represents the concept.

Rules:
- Output ONLY the HTML content (no markdown fences, no explanation)
- Use inline CSS for all styling
- Create something visually compelling — use gradients, shapes, typography
- The artifact should feel alive and connected to the emotion and archetype
- Keep it self-contained (no external resources)
- Include a brief text summary at the end as a comment: <!-- SUMMARY: ... -->`;

  // Build the user prompt — include previous artifact if evolving
  const userPromptParts = [
    `Delta:`,
    `Intent: ${delta.intent}`,
    `Emotion: ${delta.emotion}`,
    `Archetype: ${delta.archetype}`,
    `Visual Intent: ${delta.visualIntent}`,
    `Tags: ${delta.tags.join(", ")}`,
    ``,
    `Conversation context:`,
    conversationContext,
  ];

  if (isEvolution && previousArtifact) {
    userPromptParts.push(
      ``,
      `--- PREVIOUS ARTIFACT (v${previousArtifact.v}) ---`,
      previousArtifact.uri,
      `--- END PREVIOUS ARTIFACT ---`,
      ``,
      `Evolve this artifact. Let the new intent reshape it while preserving its essence.`
    );
  }

  let artifactHtml = "";
  let summary = "";
  try {
    const castResponse = await invokeLLM({
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPromptParts.join("\n"),
        },
      ],
    });

    const rawCastContent = castResponse.choices[0].message.content;
    const rawContent = typeof rawCastContent === "string" ? rawCastContent : "";
    artifactHtml = rawContent.replace(/```html\n?/g, "").replace(/```\n?/g, "").trim();

    // Extract summary from comment
    const summaryMatch = artifactHtml.match(/<!--\s*SUMMARY:\s*(.*?)\s*-->/);
    summary = summaryMatch?.[1] ?? delta.intent;
  } catch (err) {
    console.warn("[BreathingCycle] Cast failed, generating fallback artifact:", err);
    artifactHtml = `<div style="padding:2rem;text-align:center;font-family:system-ui;color:#666;">
      <p style="font-size:1.5rem;">The breath encountered stillness.</p>
      <p style="font-size:0.875rem;opacity:0.6;">${delta.intent}</p>
    </div>`;
    summary = "Breath paused — artifact pending.";
  }

  const castDurationMs = Date.now() - castStart;
  const castStalled = castDurationMs > CAST_STALL_THRESHOLD_MS;

  // Build composite embedding source text (shaped for mythic adjacency)
  const embeddingSourceText = [
    `Intent: ${delta.intent}`,
    `Emotion: ${delta.emotion}`,
    `Archetype: ${delta.archetype}`,
    `Visual: ${delta.visualIntent}`,
    `Summary: ${summary}`,
  ].join(" | ");

  // Get the next version number
  const existingVersions = await db
    .select({ v: artifactVersions.v })
    .from(artifactVersions)
    .where(and(eq(artifactVersions.projectId, projectId), eq(artifactVersions.threadId, threadId)))
    .orderBy(desc(artifactVersions.v))
    .limit(1);

  const nextVersion = (existingVersions[0]?.v ?? 0) + 1;

  // Save the artifact
  const [insertedArtifact] = await db
    .insert(artifactVersions)
    .values({
      projectId,
      threadId,
      v: nextVersion,
      kind: "html",
      uri: artifactHtml,
      summary,
      embeddingSourceText,
      compositeVersion: "v1",
      tags: delta.tags,
    })
    .$returningId();

  // ── EXHALE: Reflect and log ────────────────────────────────────────────
  transition("exhale", projectId, threadId);

  // Save assistant message summarizing what was created
  const assistantText = `**Breath ${nextVersion}** — ${summary}\n\n*Emotion: ${delta.emotion} | Archetype: ${delta.archetype}*`;
  await db.insert(messages).values({
    threadId,
    role: "assistant",
    text: assistantText,
  });

  // Determine exhale type
  const cycleDurationMs = Date.now() - cycleStartedAt;
  let exhaleType: "full" | "truncated" | "skipped" = "full";
  if (castStalled) exhaleType = "truncated";

  // Log the breath event
  await db.insert(breathEvents).values({
    projectId,
    threadId,
    inhaleDurationMs,
    castStalled,
    exhaleType,
    cycleDepth,
    messageId,
    artifactVersionId: insertedArtifact.id,
    cycleDurationMs,
  });

  const metadata: BreathMetadata = {
    inhaleDurationMs,
    castStalled,
    exhaleType,
    cycleDepth,
    cycleDurationMs,
  };

  emit({ type: "CYCLE_COMPLETE", projectId, threadId, metadata });

  // Update thread preview
  await db
    .update(threads)
    .set({ preview: text.slice(0, 120) })
    .where(eq(threads.id, threadId));

  // Return to idle
  currentState = "idle";
  currentProjectId = null;
  currentThreadId = null;
  phaseStartedAt = null;

  return { projectId, threadId, messageId };
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function transition(phase: BreathingPhase, projectId: number, threadId: number) {
  currentState = phase;
  currentProjectId = projectId;
  currentThreadId = threadId;
  phaseStartedAt = Date.now();
  emit({ type: "PHASE_CHANGED", phase, projectId, threadId });
  console.log(`[BreathingCycle] → ${phase} (project=${projectId}, thread=${threadId})`);
}

function emit(event: BreathingEvent) {
  emitter.emit("breathing", event);
}
