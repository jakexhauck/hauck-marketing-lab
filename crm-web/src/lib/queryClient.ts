import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@hauck/core";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        // Never retry auth failures — they mean "go log in", not "try again".
        if (error instanceof ApiError && (error.status === 401 || error.status === 403))
          return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});
