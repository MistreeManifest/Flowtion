import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { breathe, getBreathingSnapshot } from "./breathingCycle";
import {
  listUserThreads,
  getThreadMessages,
  getLatestArtifact,
  getBreathHistory,
} from "./db";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  flowtion: router({
    /** Send a message and trigger a full breathing cycle */
    send: protectedProcedure
      .input(
        z.object({
          text: z.string().min(1).max(10000),
          projectId: z.number().optional(),
          threadId: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = await breathe(
          ctx.user.id,
          input.text,
          input.projectId,
          input.threadId
        );
        return result;
      }),

    /** Get the current breathing state snapshot */
    breathingState: publicProcedure.query(() => {
      return getBreathingSnapshot();
    }),

    /** List all threads for the current user */
    listThreads: protectedProcedure.query(async ({ ctx }) => {
      return listUserThreads(ctx.user.id);
    }),

    /** Get messages for a thread */
    getMessages: protectedProcedure
      .input(z.object({ threadId: z.number() }))
      .query(async ({ input }) => {
        return getThreadMessages(input.threadId);
      }),

    /** Get the latest artifact for a project/thread */
    getLatestArtifact: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          threadId: z.number().optional(),
        })
      )
      .query(async ({ input }) => {
        return getLatestArtifact(input.projectId, input.threadId);
      }),

    /** Get breath history for a project */
    getBreathHistory: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          limit: z.number().min(1).max(100).optional().default(20),
        })
      )
      .query(async ({ input }) => {
        return getBreathHistory(input.projectId, input.limit);
      }),
  }),
});

export type AppRouter = typeof appRouter;
