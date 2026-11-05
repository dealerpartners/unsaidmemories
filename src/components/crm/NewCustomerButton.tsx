"use client";

import { useState } from "react";
import { CustomerFormModal } from "@/components/crm/CustomerActions";

export default function NewCustomerButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="crm-btn" type="button" onClick={() => setOpen(true)} data-tip="Add a brand-new customer by hand — their name, email, phone, and address.">New customer</button>
      {open && <CustomerFormModal onClose={() => setOpen(false)} />}
    </>
  );
}
