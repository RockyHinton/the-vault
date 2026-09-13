import { useInfiniteQuery } from "@tanstack/react-query";
import { listAuditEvents } from "./audit-api";

export function useAuditEvents() {
  return useInfiniteQuery({
    queryKey: ["audit-events"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listAuditEvents(pageParam),
    getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
  });
}
