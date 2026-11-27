import { useMutation, useQueryClient } from "@tanstack/react-query";
import { del, post } from "../../lib/api";
import { deliveryStatusText } from "../../lib/alerts";
import { useToasts } from "../../lib/store";
import type { NotificationItem } from "../../lib/types";

/** Read / read-all / delete / send-test actions; each refreshes the notification list. */
export function useNotificationActions() {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["notifications"] });
  const read = useMutation({ mutationFn: (id: string) => post(`/api/notifications/${id}/read`), onSuccess: refresh });
  const readAll = useMutation({ mutationFn: () => post("/api/notifications/read-all"), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => del(`/api/notifications/${id}`), onSuccess: refresh });
  const test = useMutation({
    mutationFn: () => post<NotificationItem>("/api/notifications/test"),
    onSuccess: (n) => {
      refresh();
      push({ title: "Test notification sent", message: `Telegram: ${deliveryStatusText(n.delivery.telegram)}`, tone: "success" });
    },
    onError: (e) => push({ title: "Test failed", message: e.message, tone: "danger" }),
  });
  return { read, readAll, remove, test };
}
