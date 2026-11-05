import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ContactForm } from "@/components/contact-form";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Contact us — UnSaid" };

export default function ContactUsPage() {
  return (
    <main className="help-main">
      <p className="help-back">
        <Link href="/help">
          <ArrowLeft size={14} /> All help
        </Link>
      </p>
      <div className="help-head">
        <span className="eyebrow">Help &amp; care / Contact us</span>
        <h1>How do I get in touch?</h1>
      </div>
      <div className="help-article-body">
        <p>Support lives in your account: sign in and write to us from Help and care, and the whole conversation stays there in one thread.</p>
        <p>We reply within one business day, usually faster.</p>
        <ContactForm />
      </div>
    </main>
  );
}
