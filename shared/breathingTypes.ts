/** The four canonical breathing states */
export type BreathingPhase = "inhale" | "delta" | "cast" | "exhale";

/** Idle means no breath is in progress */
export type BreathingState = BreathingPhase | "idle";

/** Metadata recorded for each completed breathing cycle */
export interface BreathMetadata {
  inhaleDurationMs: number;
  castStalled: boolean;
  exhaleType: "full" | "truncated" | "skipped";
  cycleDepth: number;
  cycleDurationMs: number;
}

/** The snapshot exposed to the frontend via tRPC */
export interface BreathingSnapshot {
  state: BreathingState;
  projectId: number | null;
  threadId: number | null;
  /** Progress within the current phase, 0-1 */
  phaseProgress: number;
  /** Timestamp when the current phase started */
  phaseStartedAt: number | null;
}

/** Events emitted by the breathing cycle */
export type BreathingEvent =
  | { type: "PHASE_CHANGED"; phase: BreathingPhase; projectId: number; threadId: number }
  | { type: "CYCLE_COMPLETE"; projectId: number; threadId: number; metadata: BreathMetadata }
  | { type: "CYCLE_ERROR"; projectId: number; threadId: number; error: string };

/** The delta extracted during the inhale→delta transition */
export interface BreathDelta {
  intent: string;
  emotion: string;
  archetype: string;
  visualIntent: string;
  tags: string[];
}
