import { useMutation, useQueryClient } from "@tanstack/react-query";

interface CheckoutPayload {
  customer_id: string;
  appointment_id?: string;
  payment_method: string;
  amount: number;
  notes?: string;
}

// useCheckout — process a customer checkout: creates receipt in acct_ar_receipts,
// marks appointment complete if appointment_id provided.
export function useCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CheckoutPayload) => {
      const res = await fetch("/api/admin/crm/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm"] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
  });
}
