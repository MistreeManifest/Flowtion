import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import type { BreathingState } from "../../../shared/breathingTypes";

export interface BreathingStateHook {
  /** Current breathing phase from the backend */
  state: BreathingState;
  /** Progress within the current phase (0-1), locally interpolated for smooth animation */
  progress: number;
  /** Whether a breathing cycle is currently active */
  isBreathing: boolean;
  /** The project currently breathing */
  projectId: number | null;
  /** The thread currently breathing */
  threadId: number | null;
}

/**
 * Mirrors the backend breathing state machine via tRPC polling.
 * Locally interpolates progress between polls for smooth visual animation.
 */
export function useBreathingState(): BreathingStateHook {
  const [state, setState] = useState<BreathingState>("idle");
  const [progress, setProgress] = useState(0);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [threadId, setThreadId] = useState<number | null>(null);
  const animationRef = useRef<number | null>(null);
  const phaseStartRef = useRef<number>(Date.now());

  // Poll the backend breathing state every 500ms
  const { data: snapshot } = trpc.flowtion.breathingState.useQuery(undefined, {
    refetchInterval: 500,
    staleTime: 0,
  });

  // When backend state changes, update local state
  useEffect(() => {
    if (!snapshot) return;

    if (snapshot.state !== state) {
      setState(snapshot.state);
      phaseStartRef.current = Date.now();
      setProgress(0);
    }

    setProjectId(snapshot.projectId);
    setThreadId(snapshot.threadId);
  }, [snapshot, state]);

  // Locally interpolate progress for smooth animation between polls
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
