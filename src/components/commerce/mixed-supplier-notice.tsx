"use client";

import { Package } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Separate-packages notice. Each item is made to order and ships as
 * its own package; the wording never names or counts suppliers —
 * the customer hears about packages, not about where things are made.
 */
export function MixedSupplierNotice({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <Alert>
      <Package className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{body}</AlertDescription>
    </Alert>
  );
}
