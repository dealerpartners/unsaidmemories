"use client";

/**
 * Collection Builder — studio tool for building shippable collections.
 *
 * Flow: search/select designs → name the collection → the builder checks
 * every design's supplier → warns on multi-supplier conflicts → suggests
 * same-supplier alternatives → one Publish button ships the collection.
 *
 * Kim's rule enforced: a Gelato mug + Printful shirt cannot publish
 * together without an explicit override.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  CheckCircle2,
  Package,
  Plus,
  Search,
  Truck,
  X,
} from "lucide-react";
import type {
  BuilderDesign,
  ConflictReport,
  SameSupplierRecommendation,
} from "@/lib/collection-builder";

export default function CollectionBuilderClient() {
  const { toast } = useToast();

  // ── Design picker state ──
  const [query, setQuery] = useState("");
  const [designs, setDesigns] = useState<BuilderDesign[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingDesigns, setLoadingDesigns] = useState(true);

  // ── Selection ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Conflict report ──
  const [conflict, setConflict] = useState<ConflictReport | null>(null);
  const [checkingConflict, setCheckingConflict] = useState(false);

  // ── Recommendations ──
  const [recForDesignId, setRecForDesignId] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<SameSupplierRecommendation[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);

  // ── Collection form ──
  const [name, setName] = useState("");
  const [framingCopy, setFramingCopy] = useState("");
  const [type, setType] = useState("theme");
  const [overrideMultiSupplier, setOverrideMultiSupplier] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<{ name: string; slug: string } | null>(null);

  // ── Load designs ──
  const loadDesigns = useCallback(async (q: string) => {
    setLoadingDesigns(true);
    try {
      const res = await fetch(
        `/api/admin/collections/builder/designs?q=${encodeURIComponent(q)}&limit=48`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load designs");
      setDesigns(json.designs ?? []);
      setTotal(json.total ?? 0);
    } catch (e: any) {
      toast({ title: "Could not load designs", description: e.message, variant: "destructive" });
    } finally {
      setLoadingDesigns(false);
    }
  }, [toast]);

  useEffect(() => {
    loadDesigns("");
  }, [loadDesigns]);

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => loadDesigns(query), 350);
    return () => clearTimeout(t);
  }, [query, loadDesigns]);

  const selectedDesigns = useMemo(
    () => designs.filter((d) => selectedIds.has(d.id)),
    [designs, selectedIds],
  );

  // ── Conflict check whenever selection changes ──
  useEffect(() => {
    if (!selectedIds.size) {
      setConflict(null);
      return;
    }
    const t = setTimeout(async () => {
      setCheckingConflict(true);
      try {
        const res = await fetch("/api/admin/collections/builder/conflicts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ designIds: [...selectedIds] }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Conflict check failed");
        setConflict(json);
      } catch (e: any) {
        toast({ title: "Conflict check failed", description: e.message, variant: "destructive" });
      } finally {
        setCheckingConflict(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [selectedIds, toast]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Recommendations ──
  const loadRecommendations = async (designId: string) => {
    if (recForDesignId === designId) {
      setRecForDesignId(null);
      setRecommendations([]);
      return;
    }
    setRecForDesignId(designId);
    setLoadingRecs(true);
    try {
      const exclude = selectedDesigns
        .map((d) => d.supplier_catalog_product_id)
        .filter(Boolean)
        .join(",");
      const res = await fetch(
        `/api/admin/collections/builder/recommendations?designId=${designId}&excludeIds=${encodeURIComponent(exclude)}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load recommendations");
      setRecommendations(json.recommendations ?? []);
    } catch (e: any) {
      toast({ title: "Recommendations failed", description: e.message, variant: "destructive" });
    } finally {
      setLoadingRecs(false);
    }
  };

  // ── Publish ──
  const publish = async () => {
    if (!name.trim()) {
      toast({ title: "Name the collection first", variant: "destructive" });
      return;
    }
    if (!selectedIds.size) {
      toast({ title: "Select at least one design", variant: "destructive" });
      return;
    }
    setPublishing(true);
    try {
      const res = await fetch("/api/admin/collections/builder/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          framing_copy: framingCopy.trim() || null,
          type,
          designIds: [...selectedIds],
          forceMultiSupplier: overrideMultiSupplier,
        }),
      });
      const json = await res.json();
      if (res.status === 409 && json.error === "multi_supplier_conflict") {
        toast({
          title: "Supplier conflict — publish blocked",
          description: json.message,
          variant: "destructive",
        });
        return;
      }
      if (!res.ok) throw new Error(json.error ?? "Publish failed");
      setPublished({ name: json.collection.name, slug: json.collection.slug });
      toast({
        title: `Collection "${json.collection.name}" published`,
        description: `${json.items.length} products live${json.multiSupplier ? " (multi-supplier)" : " — ships together"}.`,
      });
    } catch (e: any) {
      toast({ title: "Publish failed", description: e.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  const reset = () => {
    setPublished(null);
    setName("");
    setFramingCopy("");
    setSelectedIds(new Set());
    setConflict(null);
    setOverrideMultiSupplier(false);
  };

  if (published) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <CheckCircle2 className="mx-auto h-16 w-16 text-green-600" />
        <h1 className="mt-4 text-2xl font-bold">Collection published</h1>
        <p className="mt-2 text-muted-foreground">
          “{published.name}” is live at <code>/collections/{published.slug}</code>
        </p>
        <Button className="mt-6" onClick={reset}>
          Build another collection
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      {/* ── Left: design picker ── */}
      <div>
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search designs…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {selectedIds.size} selected{total ? ` · ${total} designs` : ""}
          </span>
        </div>

        {loadingDesigns ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44" />
            ))}
          </div>
        ) : designs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Package className="mx-auto mb-3 h-10 w-10 opacity-40" />
              No designs found. Create designs in the studio first.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {designs.map((d) => {
              const selected = selectedIds.has(d.id);
              return (
                <Card
                  key={d.id}
                  className={`cursor-pointer transition ${selected ? "ring-2 ring-primary" : "hover:shadow-md"}`}
                  onClick={() => toggleSelect(d.id)}
                >
                  <CardContent className="p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <Checkbox checked={selected} onCheckedChange={() => toggleSelect(d.id)} />
                      {d.supplier_name ? (
                        <Badge variant="secondary" className="text-[11px]">
                          <Truck className="mr-1 h-3 w-3" />
                          {d.supplier_name}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[11px]">
                          No supplier
                        </Badge>
                      )}
                    </div>
                    {d.image_url ? (
                      <img
                        src={d.image_url}
                        alt={d.name}
                        className="mb-2 aspect-square w-full rounded object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="mb-2 grid aspect-square w-full place-items-center rounded bg-muted text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    {d.catalog_product_name && (
                      <p className="truncate text-xs text-muted-foreground">
                        on {d.catalog_product_name}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Right: builder panel ── */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>New collection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="col-name">Collection name</Label>
              <Input
                id="col-name"
                placeholder="e.g. KIN Score"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="col-copy">Framing copy</Label>
              <Textarea
                id="col-copy"
                placeholder="What this collection is about…"
                value={framingCopy}
                onChange={(e) => setFramingCopy(e.target.value)}
                rows={3}
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="theme">Theme</SelectItem>
                  <SelectItem value="holiday">Holiday</SelectItem>
                  <SelectItem value="relationship">Relationship</SelectItem>
                  <SelectItem value="evergreen">Evergreen</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* ── Supplier status ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Supplier check</CardTitle>
          </CardHeader>
          <CardContent>
            {checkingConflict ? (
              <Skeleton className="h-16" />
            ) : !conflict || selectedIds.size === 0 ? (
              <p className="text-sm text-muted-foreground">
                Select designs to check supplier alignment.
              </p>
            ) : conflict.hasConflict ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Ships separately — {conflict.supplierCount} suppliers</AlertTitle>
                <AlertDescription>
                  <p className="mb-2">
                    These items come from different suppliers. Customers will
                    receive <strong>separate shipments</strong>.
                  </p>
                  <ul className="space-y-1">
                    {conflict.groups.map((g) => (
                      <li key={g.supplier_id} className="text-sm">
                        <strong>{g.supplier_name}:</strong> {g.design_names.join(", ")}
                      </li>
                    ))}
                  </ul>
                  {conflict.unknownSupplier.length > 0 && (
                    <p className="mt-2 text-sm">
                      No supplier found for: {conflict.unknownSupplier.map((u) => u.name).join(", ")}
                    </p>
                  )}
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={overrideMultiSupplier}
                      onCheckedChange={(v) => setOverrideMultiSupplier(v === true)}
                    />
                    Publish anyway — I accept separate shipments
                  </label>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-green-600">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-700">Ships together</AlertTitle>
                <AlertDescription>
                  All {selectedIds.size} item{selectedIds.size === 1 ? "" : "s"} ship from{" "}
                  <strong>{conflict.groups[0]?.supplier_name}</strong> — one shipment.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* ── Selected items + recommendations ── */}
        {selectedDesigns.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Selected ({selectedDesigns.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {selectedDesigns.map((d) => (
                <div key={d.id}>
                  <div className="flex items-center justify-between gap-2 rounded border p-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{d.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.supplier_name ?? "No supplier"}
                        {d.catalog_product_name ? ` · ${d.catalog_product_name}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => loadRecommendations(d.id)}
                        title="Suggest same-supplier alternatives"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleSelect(d.id)}
                        title="Remove"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Recommendations for this design */}
                  {recForDesignId === d.id && (
                    <div className="ml-4 mt-2 rounded border border-dashed p-2">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Same-supplier alternatives
                        {d.supplier_name ? ` — ${d.supplier_name}` : ""}
                      </p>
                      {loadingRecs ? (
                        <Skeleton className="h-12" />
                      ) : recommendations.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No alternatives found from this supplier.
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {recommendations.map((r) => (
                            <div
                              key={r.id}
                              className="flex items-center justify-between gap-2 rounded bg-muted/50 p-2"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium">{r.name}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {r.category_name ?? "Uncategorized"} · ships with {r.supplier_name}
                                </p>
                              </div>
                              <Badge variant="outline" className="shrink-0 text-[10px]">
                                <Truck className="mr-1 h-3 w-3" />
                                Ships together
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Button
          className="w-full"
          size="lg"
          onClick={publish}
          disabled={publishing || !selectedIds.size || !name.trim()}
        >
          {publishing ? "Publishing…" : `Publish collection (${selectedIds.size})`}
        </Button>
        {conflict?.hasConflict && !overrideMultiSupplier && (
          <p className="text-center text-xs text-muted-foreground">
            Multi-supplier — check “publish anyway” above to override.
          </p>
        )}
      </div>
    </div>
  );
}
