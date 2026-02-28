import { describe, expect, it, vi, beforeEach } from "vitest";
import { getBreathingSnapshot } from "./breathingCycle";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

function createPublicContext(): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

describe("Breathing Cycle", () => {
  describe("getBreathingSnapshot", () => {
    it("returns idle state when no cycle is active", () => {
      const snapshot = getBreathingSnapshot();

      expect(snapshot.state).toBe("idle");
      expect(snapshot.projectId).toBeNull();
      expect(snapshot.threadId).toBeNull();
      expect(snapshot.phaseProgress).toBe(0);
    });

    it("snapshot has the correct shape", () => {
      const snapshot = getBreathingSnapshot();

      expect(snapshot).toHaveProperty("state");
      expect(snapshot).toHaveProperty("projectId");
      expect(snapshot).toHaveProperty("threadId");
      expect(snapshot).toHaveProperty("phaseProgress");
      expect(snapshot).toHaveProperty("phaseStartedAt");
    });
  });

  describe("tRPC breathing state endpoint", () => {
    it("returns breathing snapshot via public procedure", async () => {
      const { ctx } = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.flowtion.breathingState();

      expect(result).toBeDefined();
      expect(result.state).toBe("idle");
      expect(typeof result.phaseProgress).toBe("number");
    });
  });

  describe("tRPC send endpoint", () => {
    it("validates empty text input", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.flowtion.send({ text: "" })
      ).rejects.toThrow();
    });

    it("send procedure exists on the flowtion router", () => {
      // Verify the send mutation is wired up on the router
      expect(appRouter.flowtion.send).toBeDefined();
      expect(appRouter.flowtion.send._def).toBeDefined();
    });
  });

  describe("tRPC list threads endpoint", () => {
    it("works for unauthenticated users (public)", async () => {
      const { ctx } = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.flowtion.listThreads();
      expect(Array.isArray(result)).toBe(true);
    });

    it("returns array for authenticated users", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.flowtion.listThreads();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("tRPC get messages endpoint", () => {
    it("works for unauthenticated users (public)", async () => {
      const { ctx } = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.flowtion.getMessages({ threadId: 1 });
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
