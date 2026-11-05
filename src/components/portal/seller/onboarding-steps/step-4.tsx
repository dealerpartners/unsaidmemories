'use client'

// Step 4 — Business Verification (Tree A). The bank-grade KYC filing,
// all in one place per the platform's intake design:
//   · seller type — the persisted classification on the seller record
//     (Manufacturer brand · Supplier · Reseller · Drop shipper)
//   · legal identity + tax ID (last four stored; the full number never)
//   · document uploads — tax ID document · government identification ·
//     resale tax certificate · business registration
//   · primary products, brand names, production capacity
//   · purchase orders on record
//   · the other platforms they sell on, and their social media
// Saving files a verification task (verification_tasks) with the
// document record, stamps sellers.seller_type, and upserts the
// application record (seller_partner_applications) — the packet the
// admin verification review works from. Document files UPLOAD for
// real (§1.2): choosing a file POSTs it to
// /api/seller/onboarding/documents, which stores it in the private
// seller-documents bucket and records the real storage path on a
// verification_tasks row (evidence_url) and in this step's state;
// the save below carries that storagePath in the documents list.
// If an upload fails, the document is still recorded by
// name/size/type and the failure is shown — never silently.

import { useEffect, useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { OnboardingShell } from "@/components/portal/seller/OnboardingWizard"
import { uploadSellerDocument, type SellerDocumentKind } from "@/lib/partner-wizard/seller-documents"
import { cn } from "@/lib/utils"

const SELLER_TYPES = [
  { id: "manufacturer_brand", label: "Manufacturer brand", detail: "You make the products and own the brand." },
  { id: "supplier", label: "Supplier", detail: "You supply products to other sellers or retailers." },
  { id: "reseller", label: "Reseller", detail: "You buy from brands or distributors and resell." },
  { id: "drop_shipper", label: "Drop shipper", detail: "You list products that a third party fulfills on order." },
]

const PLATFORMS = ["Amazon", "Walmart", "eBay", "Etsy", "Shopify / own store", "Chewy", "TikTok Shop", "Other"]

const DOCUMENTS = [
  { id: "tax-id-document", label: "Tax ID document", detail: "EIN confirmation letter or equivalent tax document.", required: true },
  { id: "government-id", label: "Government identification", detail: "Photo ID of the owner or authorized representative.", required: true },
  { id: "resale-certificate", label: "Resale tax certificate", detail: "Your state resale / seller's permit certificate, if you hold one.", required: false },
  { id: "business-registration", label: "Business registration", detail: "State registration or formation certificate.", required: false },
  { id: "insurance-certificate", label: "Insurance certificate", detail: "Certificate of insurance for your business — reviewed at the verification desk as its own check.", required: false },
]

interface PoRow {
  number: string
  supplier: string
  amount: string
}

interface ChosenDoc {
  name: string
  size: number
  type: string
  storagePath?: string
  uploading?: boolean
  error?: string
}

interface Step4Seed {
  sellerType: string
  legalName: string
  dba: string
  contactName: string
  businessAddress: string
  primaryProducts: string
  brandNames: string
  productionCapacity: string
}

export default function Step4Page() {
  const [platforms, setPlatforms] = useState<Record<string, boolean>>({})
  const [social, setSocial] = useState<Record<string, string>>({})
  const [pos, setPos] = useState<PoRow[]>([{ number: "", supplier: "", amount: "" }])
  const [chosen, setChosen] = useState<Record<string, ChosenDoc>>({})
  const [seed, setSeed] = useState<Step4Seed | null>(null)
  const [taxId, setTaxId] = useState("")
  const [savedTaxLast4, setSavedTaxLast4] = useState("")

  // Resume/edit: hydrate the whole packet from the saved step-4 state.
  // Without this, reopening the step showed a blank packet and saving
  // it REPLACED the filed record — documents, platforms, social, and
  // purchase orders already on file were wiped by the re-save.
  useEffect(() => {
    let cancelled = false
    fetch("/api/seller/onboarding", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { state?: { step: string; data?: Record<string, unknown> }[] } | null) => {
        if (cancelled) return
        const row = (d?.state || []).find((s) => s.step === "step-4" || s.step === "business-verification")
        const data = row?.data ?? {}
        const s = (v: unknown) => (typeof v === "string" ? v : "")
        setSeed({
          sellerType: s(data.seller_type),
          legalName: s(data.legalName) || s(data.legal_name),
          dba: s(data.dba),
          contactName: s(data.contact_name),
          businessAddress: s(data.business_address) || s(data.businessAddress),
          primaryProducts: s(data.primary_products),
          brandNames: s(data.brand_names),
          productionCapacity: s(data.production_capacity),
        })
        if (Array.isArray(data.platforms)) {
          setPlatforms(Object.fromEntries(data.platforms.map((p) => [String(p), true])) as Record<string, boolean>)
        }
        if (data.social && typeof data.social === "object" && !Array.isArray(data.social)) {
          setSocial(data.social as Record<string, string>)
        }
        if (Array.isArray(data.purchase_orders) && data.purchase_orders.length > 0) {
          setPos(
            data.purchase_orders.map((p) => {
              const po = p as Record<string, unknown>
              return { number: s(po.number), supplier: s(po.supplier), amount: s(po.amount) }
            }),
          )
        }
        if (Array.isArray(data.documents)) {
          const docs: Record<string, ChosenDoc> = {}
          for (const d0 of data.documents) {
            const doc = d0 as Record<string, unknown>
            if (typeof doc.id === "string" && doc.id) {
              docs[doc.id] = {
                name: s(doc.fileName) || s(doc.file_name),
                size: Number(doc.size || 0),
                type: s(doc.type),
                ...(typeof doc.storagePath === "string" ? { storagePath: doc.storagePath } : {}),
              }
            }
          }
          setChosen(docs)
        }
        if (typeof data.tax_id_last4 === "string") setSavedTaxLast4(data.tax_id_last4)
      })
      .catch(() => {
        if (!cancelled) {
          setSeed({
            sellerType: "",
            legalName: "",
            dba: "",
            contactName: "",
            businessAddress: "",
            primaryProducts: "",
            brandNames: "",
            productionCapacity: "",
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function uploadDocument(docId: string, file: File) {
    setChosen((c) => ({
      ...c,
      [docId]: { name: file.name, size: file.size, type: file.type, uploading: true },
    }))
    try {
      // Crew A document pipeline contract (src/lib/partner-wizard/documents):
      // real file -> private storage + partner_application_documents row +
      // verification_tasks evidence for the admin verification desk.
      const up = await uploadSellerDocument(docId as SellerDocumentKind, file)
      setChosen((c) => ({
        ...c,
        [docId]: {
          name: file.name,
          size: file.size,
          type: file.type,
          storagePath: up.storagePath,
        },
      }))
    } catch (err) {
      setChosen((c) => ({
        ...c,
        [docId]: {
          name: file.name,
          size: file.size,
          type: file.type,
          error: err instanceof Error ? err.message : "Upload failed",
        },
      }))
    }
  }

  const socialField = (id: string, label: string, placeholder: string) => (
    <div className="space-y-2">
      <Label htmlFor={`social-${id}`}>{label}</Label>
      <Input
        id={`social-${id}`}
        value={social[id] || ""}
        onChange={(e) => setSocial((s) => ({ ...s, [id]: e.target.value }))}
        placeholder={placeholder}
      />
    </div>
  )

  return (
    <OnboardingShell
      step={4}
      title="Business verification"
      description="This application is reviewed like a bank reviews an account: legal identity, tax records, and documents, verified before your store can sell. Provide everything in this one step."
      submitLabel="File for verification"
      collectData={() => {
        // The two documents marked required are actually required: a
        // packet filed without them is not a bank-grade filing, and
        // marking this step complete without them misstates the record.
        // A document counts when it is on the packet — uploaded for
        // real, or recorded by name after a failed upload (shown above
        // with its retry affordance), or filed on an earlier visit
        // (hydrated into `chosen` from the saved step).
        const missing = DOCUMENTS.filter((d) => d.required && !chosen[d.id]?.name)
        if (missing.length > 0) {
          throw new Error(
            `Choose the required document${missing.length === 1 ? "" : "s"} first: ${missing.map((d) => d.label).join(", ")}.`,
          )
        }
        return {
        documents: Object.entries(chosen)
          .filter(([, v]) => v.name)
          .map(([id, v]) => ({
            id,
            fileName: v.name,
            size: v.size,
            type: v.type,
            ...(v.storagePath ? { storagePath: v.storagePath } : {}),
          })),
        platforms: Object.entries(platforms).filter(([, v]) => v).map(([k]) => k),
        social: Object.fromEntries(Object.entries(social).filter(([, v]) => v.trim())),
        purchase_orders: pos
          .filter((p) => p.number.trim() || p.supplier.trim())
          .map((p) => ({ number: p.number.trim(), supplier: p.supplier.trim(), amount: p.amount.trim() })),
        // A revisit that leaves the tax ID blank keeps the one on
        // file — serializeStepForm would otherwise land an empty
        // tax_id_last4 over the filed value.
        ...(!taxId.trim() && savedTaxLast4 ? { tax_id_last4: savedTaxLast4 } : {}),
        }
      }}
    >
      {!seed ? (
        <p className="text-sm text-muted-foreground">Loading your filed verification packet…</p>
      ) : (
      <div className="space-y-8" key="seeded">
        {/* Seller type */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Seller type <span className="text-destructive">*</span></h3>
          <p className="text-xs text-muted-foreground">
            This classification is recorded on your seller account. It shapes your review, your
            category permissions, and how the marketplace segments your store.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {SELLER_TYPES.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5 hover:bg-muted/40"
              >
                <input type="radio" name="seller_type" value={t.id} required defaultChecked={seed.sellerType === t.id} className="mt-1 accent-primary" />
                <span>
                  <span className="block text-sm font-semibold">{t.label}</span>
                  <span className="block text-xs text-muted-foreground">{t.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        {/* Legal identity */}
        <section className="space-y-4 border-t pt-6">
          <h3 className="text-sm font-semibold">Legal identity</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="legalName">Legal business name <span className="text-destructive">*</span></Label>
              <Input id="legalName" name="legalName" required defaultValue={seed.legalName} placeholder="Exactly as registered" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dba">DBA / trade name</Label>
              <Input id="dba" name="dba" defaultValue={seed.dba} placeholder="If different from legal name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxId">
                Tax ID (EIN or SSN) {!savedTaxLast4 && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="taxId"
                name="taxId"
                required={!savedTaxLast4}
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                placeholder={savedTaxLast4 ? `••••${savedTaxLast4} on file — leave blank to keep` : "Tax identification number"}
              />
              <p className="text-xs text-muted-foreground">Only the last four digits are stored.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactName">Authorized representative</Label>
              <Input id="contactName" name="contact_name" defaultValue={seed.contactName} placeholder="The person filing this application" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="businessAddress">Business address</Label>
              <Input id="businessAddress" name="business_address" defaultValue={seed.businessAddress} placeholder="Street, city, state, ZIP" />
            </div>
          </div>
        </section>

        {/* Documents */}
        <section className="space-y-3 border-t pt-6">
          <h3 className="text-sm font-semibold">Documents</h3>
          <p className="text-xs text-muted-foreground">
            Each document uploads to private storage when you choose it, and its real storage
            path is recorded on your verification file — the review team works from the file
            itself. PDF, PNG/JPG, Word, or text, up to 10 MB.
          </p>
          <div className="space-y-3">
            {DOCUMENTS.map((doc) => (
              <div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                <div>
                  <p className="text-sm font-semibold">
                    {doc.label} {doc.required && <span className="text-destructive">*</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{doc.detail}</p>
                  {chosen[doc.id]?.uploading && (
                    <p className="mt-1 text-xs font-medium text-muted-foreground">
                      Uploading {chosen[doc.id].name}…
                    </p>
                  )}
                  {chosen[doc.id]?.storagePath && (
                    <p className="mt-1 text-xs font-medium text-primary">
                      {chosen[doc.id].name} — uploaded, on your verification file
                    </p>
                  )}
                  {chosen[doc.id]?.error && (
                    <p className="mt-1 text-xs font-medium text-destructive">
                      {chosen[doc.id].name} — upload failed: {chosen[doc.id].error} Saving this
                      step still records the document by name; choose the file again to retry
                      the upload.
                    </p>
                  )}
                </div>
                <label className="cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted">
                  Choose file
                  <input
                    type="file"
                    name={`doc-${doc.id}`}
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void uploadDocument(doc.id, f)
                    }}
                  />
                </label>
              </div>
            ))}
          </div>
        </section>

        {/* Business facts */}
        <section className="space-y-4 border-t pt-6">
          <h3 className="text-sm font-semibold">What you sell</h3>
          <div className="space-y-2">
            <Label htmlFor="primaryProducts">Primary products <span className="text-destructive">*</span></Label>
            <Textarea
              id="primaryProducts"
              name="primary_products"
              required
              rows={3}
              defaultValue={seed.primaryProducts}
              placeholder="The products your business is known for — categories, lines, and best sellers."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="brandNames">Brand names</Label>
              <Input id="brandNames" name="brand_names" defaultValue={seed.brandNames} placeholder="Brands you own or are authorized to sell" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="productionCapacity">Production / supply capacity</Label>
              <Input id="productionCapacity" name="production_capacity" defaultValue={seed.productionCapacity} placeholder="e.g. 5,000 units / month" />
            </div>
          </div>
        </section>

        {/* Purchase orders */}
        <section className="space-y-3 border-t pt-6">
          <h3 className="text-sm font-semibold">Purchase orders</h3>
          <p className="text-xs text-muted-foreground">
            Recent purchase orders evidence your supply chain. Record the ones that represent how you stock.
          </p>
          {pos.map((po, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-3">
              <Input
                value={po.number}
                onChange={(e) => setPos((rows) => rows.map((r, j) => (j === i ? { ...r, number: e.target.value } : r)))}
                placeholder="PO number"
              />
              <Input
                value={po.supplier}
                onChange={(e) => setPos((rows) => rows.map((r, j) => (j === i ? { ...r, supplier: e.target.value } : r)))}
                placeholder="Supplier"
              />
              <Input
                value={po.amount}
                onChange={(e) => setPos((rows) => rows.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)))}
                placeholder="Amount"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPos((rows) => [...rows, { number: "", supplier: "", amount: "" }])}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Add another purchase order
          </button>
        </section>

        {/* Platforms + social */}
        <section className="space-y-4 border-t pt-6">
          <h3 className="text-sm font-semibold">Where else you sell</h3>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <label
                key={p}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                  platforms[p] ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"
                )}
              >
                <Checkbox
                  checked={!!platforms[p]}
                  onCheckedChange={(v) => setPlatforms((s) => ({ ...s, [p]: v === true }))}
                  className="sr-only"
                />
                {p}
              </label>
            ))}
          </div>
          <h3 className="pt-2 text-sm font-semibold">Social media</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {socialField("instagram", "Instagram", "@handle or profile URL")}
            {socialField("facebook", "Facebook", "Page name or URL")}
            {socialField("tiktok", "TikTok", "@handle or profile URL")}
            {socialField("youtube", "YouTube", "Channel name or URL")}
          </div>
        </section>
      </div>
      )}
    </OnboardingShell>
  )
}
