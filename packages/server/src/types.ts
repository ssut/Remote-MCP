import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { MCPRouter } from './router.js';

export type AppRouter = ReturnType<MCPRouter['createTRPCRouter']>;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
