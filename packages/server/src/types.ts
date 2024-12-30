import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { MCPRouter } from "./router";

export type AppRouter = ReturnType<MCPRouter["createTRPCRouter"]>;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
