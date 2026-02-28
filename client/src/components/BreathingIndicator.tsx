import { motion, AnimatePresence } from "framer-motion";
import type { BreathingState } from "../../../shared/breathingTypes";

interface BreathingIndicatorProps {
  state: BreathingState;
  progress: number;
}

const PHASE_CONFIG: Record<
  string,
  { label: string; colorVar: string; scaleRange: [number, number]; pulseSpeed: number }
> = {
  idle: { label: "Resting", colorVar: "var(--muted-foreground)", scaleRange: [0.85, 1.0], pulseSpeed: 4 },
  inhale: { label: "Inhaling", colorVar: "var(--breath-inhale)", scaleRange: [0.8, 1.2], pulseSpeed: 1.8 },
  delta: { label: "Shaping", colorVar: "var(--breath-delta)", scaleRange: [0.9, 1.15], pulseSpeed: 2.5 },
  cast: { label: "Casting", colorVar: "var(--breath-cast)", scaleRange: [0.95, 1.25], pulseSpeed: 1.2 },
  exhale: { label: "Exhaling", colorVar: "var(--breath-exhale)", scaleRange: [1.1, 0.85], pulseSpeed: 2.2 },
};

/**
 * A living, breathing visual indicator that reflects the backend breathing state.
 * Uses organic motion curves — no linear transitions.
 */
export function BreathingIndicator({ state, progress }: BreathingIndicatorProps) {
  const config = PHASE_CONFIG[state] ?? PHASE_CONFIG.idle;
  const isActive = state !== "idle";

  // Organic easing: use a sine-based oscillation for the "living" feel
  const breathCycle = Math.sin(progress * Math.PI);
  const scale =
    config.scaleRange[0] + (config.scaleRange[1] - config.scaleRange[0]) * breathCycle;
  const opacity = isActive ? 0.6 + 0.4 * breathCycle : 0.3;

  return (
    <div className="flex items-center gap-3">
      {/* Breathing orb */}
      <div className="relative flex items-center justify-center" style={{ width: 36, height: 36 }}>
        {/* Outer glow ring */}
        <motion.div
          className="absolute inset-0 rounded-full"
          animate={{
            scale: isActive ? [1, 1.4, 1] : 1,
            opacity: isActive ? [0.15, 0.35, 0.15] : 0.05,
          }}
          transition={{
            duration: config.pulseSpeed,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{
            background: `radial-gradient(circle, ${config.colorVar} 0%, transparent 70%)`,
          }}
        />

        {/* Inner orb */}
        <motion.div
          className="relative rounded-full"
          animate={{
            scale,
            opacity,
          }}
          transition={{
            type: "spring",
            stiffness: 60,
            damping: 15,
            mass: 0.8,
          }}
          style={{
            width: 14,
            height: 14,
            background: config.colorVar,
            boxShadow: `0 0 ${isActive ? 12 : 4}px ${config.colorVar}`,
          }}
        />
      </div>

      {/* Phase label */}
      <AnimatePresence mode="wait">
        <motion.span
          key={state}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="text-xs font-light tracking-wider uppercase"
          style={{ color: config.colorVar }}
        >
          {config.label}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

/**
 * A thin progress bar that shows phase progress with organic easing.
 */
export function BreathingProgress({ state, progress }: BreathingIndicatorProps) {
  const config = PHASE_CONFIG[state] ?? PHASE_CONFIG.idle;
  const isActive = state !== "idle";

  if (!isActive) return null;

  return (
    <div className="w-full h-0.5 bg-border/30 rounded-full overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        animate={{ width: `${progress * 100}%` }}
        transition={{ type: "spring", stiffness: 40, damping: 20 }}
        style={{ background: config.colorVar }}
      />
    </div>
  );
}
