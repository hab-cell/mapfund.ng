import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15 * 1000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

// ─── Cross-admin sync bridge ─────────────────────────────────────────────
// Every entity write is persisted to localStorage (mapfund_entity_<name>).
// When ANOTHER admin tab/session writes data, the browser fires a "storage"
// event here. We invalidate ALL queries so every admin page refetches the
// latest data immediately — uploads made by one admin are always visible to
// the others without any manual refresh.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key && event.key.startsWith("mapfund_entity_")) {
      queryClient.invalidateQueries();
    }
  });
}
