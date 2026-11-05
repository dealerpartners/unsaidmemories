import type { Metadata } from "next";
import Subnav from "../subnav";
import CalendarClient from "./calendar-client";

export const metadata: Metadata = { title: "Social calendar — Admin" };
export const dynamic = "force-dynamic";

export default function CalendarPage() {
  return (
    <div>
      <div className="fabric-page-head">
        <h1>Calendar & queue</h1>
      </div>
      <Subnav />
      <CalendarClient />
    </div>
  );
}
