/**
 * Seed the Fabric studio: a designer login + sample designs + a
 * collection, so the full studio journey can be walked in the browser.
 *
 * Credentials: parsed at runtime from ~/workspace/user/files/
 * UNSAID_CREDS.md (Supabase URL + the JWT whose decoded role is
 * service_role). Nothing is printed except the seeded user's email,
 * row ids and counts. The designer's password comes ONLY from the
 * SEED_DESIGNER_PASSWORD env var — it is never stored in this repo.
 *
 * Run AFTER the fabric migration has been applied:
 *   SEED_DESIGNER_PASSWORD='…' node scripts/seed-fabric.mjs
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const TENANT = "652fd2be-d19a-4778-835d-db38094d7718";
const DESIGNER_EMAIL = "designer@unsaid.test";

function loadCreds() {
  // Preferred source: the worktree .env (SUPABASE_URL +
  // SUPABASE_SERVICE_ROLE_KEY are both defined there).
  try {
    const envText = readFileSync(path.join(process.cwd(), ".env"), "utf8");
    const env = {};
    for (const l of envText.split("\n")) {
      const m = l.match(/^([A-Z_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].trim();
    }
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      return { url: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY };
    }
  } catch { /* fall through to the creds doc */ }

  // Fallback: parse the creds doc (URL + the JWT whose decoded role
  // is service_role). Values are never printed.
  const file = path.join(homedir(), "workspace/user/files/UNSAID_CREDS.md");
  const text = readFileSync(file, "utf8").replace(/\\_/g, "_");
  const urlMatch = text.match(/https:\/\/[a-z0-9]+\.supabase\.co/);
  if (!urlMatch) throw new Error("Supabase URL not found in creds doc or .env");
  const jwts = text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? [];
  let serviceKey = null;
  for (const jwt of jwts) {
    try {
      const payload = JSON.parse(
        Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"),
      );
      if (payload.role === "service_role") serviceKey = jwt;
    } catch { /* not a supabase jwt */ }
  }
  if (!serviceKey) throw new Error("service_role key not found in creds doc or .env");
  return { url: urlMatch[0], serviceKey };
}

const { url, serviceKey } = loadCreds();
const password = process.env.SEED_DESIGNER_PASSWORD;
if (!password) throw new Error("SEED_DESIGNER_PASSWORD env var is required");

const H = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function rest(method, pathQ, body, extraHeaders = {}) {
  const res = await fetch(`${url}/rest/v1/${pathQ}`, {
    method,
    headers: { ...H, Prefer: "return=representation", ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${pathQ} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function ensureDesigner() {
  const list = await fetch(`${url}/auth/v1/admin/users`, { headers: H });
  const { users } = await list.json();
  const existing = (users ?? []).find((u) => u.email === DESIGNER_EMAIL);
  if (existing) return existing.id;
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      email: DESIGNER_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Studio Designer", role: "designer" },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`create user failed: ${JSON.stringify(data).slice(0, 200)}`);
  return data.id;
}

function v2State(productType, kind, catalogId, front, back) {
  return {
    app: "Fabric Design Studio",
    version: 2,
    productName: "",
    productType,
    garmentColor: "#ffffff",
    supplierCatalogProductId: catalogId,
    templateKind: kind,
    surfaces: { Front: front, Back: back },
  };
}

const textNode = (id, text, x, y, fontSize = 30, fill = "#202126", width = 200) => ({
  id, kind: "text", name: "Text", x, y, text, fontSize,
  fontFamily: "Space Grotesk", fontStyle: "bold", fill, align: "center",
  width, rotation: 0, opacity: 1, scaleX: 1, scaleY: 1,
});
const rectNode = (id, x, y) => ({
  id, kind: "rect", name: "Rectangle", x, y, width: 150, height: 10,
  fill: "#c45b3c", stroke: "#ffffff", strokeWidth: 0, cornerRadius: 5,
  rotation: 0, opacity: 1, scaleX: 1, scaleY: 1,
});
const imageNode = (id, src, x, y, w = 180) => ({
  id, kind: "image", name: "Artwork", x, y, width: w, height: w, src,
  rotation: 0, opacity: 1, scaleX: 1, scaleY: 1,
});

async function pickProduct(spec, fallbackIlike) {
  const base = "supplier_catalog_products?select=id,name,supplier_id,category_id,image_url";
  const tries = [
    `&supplier_id=eq.${spec.supplierId}&name=ilike.${encodeURIComponent(fallbackIlike)}&image_url=not.is.null&limit=1`,
    `&supplier_id=eq.${spec.supplierId}&image_url=not.is.null&limit=1`,
    `&supplier_id=eq.${spec.supplierId}&name=ilike.${encodeURIComponent(fallbackIlike)}&limit=1`,
    `&supplier_id=eq.${spec.supplierId}&limit=1`,
  ];
  for (const t of tries) {
    const rows = await rest("GET", base + t);
    if (rows?.length) return rows[0];
  }
  throw new Error(`No catalog product found for supplier ${spec.supplierId}`);
}

async function main() {
  const designerId = await ensureDesigner();
  console.log("designer user:", DESIGNER_EMAIL, designerId);

  const suppliers = await rest("GET", "suppliers?select=id,name,slug");
  const bySlug = Object.fromEntries(suppliers.map((s) => [s.slug, s]));
  const printful = bySlug["printful"];
  const gelato = bySlug["gelato"];
  if (!printful) throw new Error("Printful supplier row not found");

  const teeProduct = await pickProduct({ supplierId: printful.id }, "%t-shirt%");
  const mugProduct = gelato
    ? await pickProduct({ supplierId: gelato.id }, "%mug%")
    : await pickProduct({ supplierId: printful.id }, "%mug%");
  console.log("catalog picks:", teeProduct.name, "|", mugProduct.name);

  // Collection first so designs can be filed into it.
  const slug = "kim-score";
  let [collection] = await rest("GET", `collections?select=id&slug=eq.${slug}`);
  if (!collection) {
    [collection] = await rest("POST", "collections", {
      tenant_id: TENANT,
      type: "theme",
      name: "Kim Score",
      slug,
      framing_copy: "Seeded collection — two Printful designs that ship together.",
      is_active: true,
    });
  }
  console.log("collection:", collection.id);

  let [project] = await rest(
    "GET",
    `projects?select=id&name=eq.${encodeURIComponent("Kim Score — Studio Seed")}`,
  );
  if (!project) {
    [project] = await rest("POST", "projects", {
      tenant_id: TENANT,
      owner_id: designerId,
      name: "Kim Score — Studio Seed",
      collection_id: collection.id,
      canvas_state: {},
      status: "draft",
    });
  }

  const designs = [];
  const mkDesign = async (row) => {
    const [existing] = await rest(
      "GET",
      `designs?select=id&name=eq.${encodeURIComponent(row.name)}`,
    );
    if (existing) {
      designs.push(existing);
      return existing;
    }
    const [d] = await rest("POST", "designs", {
      tenant_id: TENANT,
      owner_id: designerId,
      project_id: project.id,
      status: "draft",
      ...row,
    });
    designs.push(d);
    return d;
  };

  const tee = await mkDesign({
    name: "Kin Keeper Tee — seed",
    product_title: "Kin Keeper Premium Tee",
    description: "Seeded studio design: the Kin Keeper wordmark on a premium tee.",
    retail_price: 34.99,
    category_id: teeProduct.category_id,
    collection_id: collection.id,
    supplier_catalog_product_id: teeProduct.id,
    product_type: "Classic Tee",
    garment_color: "#ffffff",
    // Tee print area in stage coords is x130–290 / y155–360; the
    // artwork is sized to sit inside it so preflight passes.
    canvas_state: v2State("Classic Tee", "tee", teeProduct.id,
      [textNode("t1", "KIN KEEPER", 135, 210, 34, "#202126", 150), rectNode("r1", 135, 262),
       textNode("t2", "EST. 2026 · MEMPHIS", 135, 282, 13, "#5b5d68", 150)],
      [textNode("t3", "unsaid", 135, 230, 20, "#5b5d68", 150)]),
  });

  const second = await mkDesign({
    name: "Chosen Family Tee — seed",
    product_title: "Chosen Family Tee",
    description: "Seeded studio design: chosen-family statement tee (same supplier as the Kin Keeper tee).",
    retail_price: 32.99,
    category_id: teeProduct.category_id,
    collection_id: collection.id,
    supplier_catalog_product_id: teeProduct.id,
    product_type: "Classic Tee",
    garment_color: "#f3f1ea",
    canvas_state: v2State("Classic Tee", "tee", teeProduct.id,
      [textNode("t1", "CHOSEN FAMILY", 135, 215, 30, "#356b56", 150)],
      []),
  });

  const mug = await mkDesign({
    name: "Golden Hour Mug — seed",
    product_title: "Golden Hour Mug",
    description: "Seeded studio design on a different supplier's mug — the collection builder's conflict demo.",
    retail_price: 21.99,
    category_id: mugProduct.category_id,
    collection_id: null,
    supplier_catalog_product_id: mugProduct.id,
    product_type: "Ceramic Mug",
    garment_color: "#ffffff",
    canvas_state: v2State("Ceramic Mug", "mug", mugProduct.id,
      [textNode("t1", "GOLDEN HOUR", 118, 215, 22),
       ...(mugProduct.image_url ? [imageNode("i1", mugProduct.image_url, 130, 260, 120)] : [])],
      []),
  });
  console.log("designs:", designs.map((d) => d.id).join(", "));

  // A real stored print file for the tee design (1×1 PNG placeholder —
  // the browser journey re-exports the true print file over it).
  const png1x1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
    "base64",
  );
  const storagePath = `designs/${tee.id}/print-front.png`;
  const up = await fetch(`${url}/storage/v1/object/design-files/${storagePath}`, {
    method: "POST",
    headers: { ...H, "Content-Type": "image/png", "x-upsert": "true" },
    body: png1x1,
  });
  if (!up.ok) throw new Error(`storage upload failed: ${up.status} ${await up.text()}`);
  const [existingAsset] = await rest(
    "GET",
    `design_assets?select=id&design_id=eq.${tee.id}&kind=eq.print&provider=eq.seed`,
  );
  if (!existingAsset) {
    await rest("POST", "design_assets", {
      tenant_id: TENANT,
      project_id: project.id,
      design_id: tee.id,
      kind: "print",
      surface: "Front",
      storage_path: storagePath,
      bucket: "design-files",
      mime_type: "image/png",
      provider: "seed",
      metadata: { seed: true, note: "placeholder — browser journey re-exports" },
    });
  }
  await rest("PATCH", `designs?id=eq.${tee.id}`, {
    print_file_path: `design-files/${storagePath}`,
  });
  // Print file of record in the pre-existing design_files table.
  const [existingFile] = await rest(
    "GET",
    `design_files?select=id&design_id=eq.${tee.id}&placement=eq.front`,
  );
  if (!existingFile) {
    await rest("POST", "design_files", {
      design_id: tee.id,
      placement: "front",
      file_url: `design-files/${storagePath}`,
      width_px: 4500,
      height_px: 5400,
      dpi: 300,
      version: 1,
    });
  }
  console.log("print asset stored:", storagePath);
  console.log("SEED COMPLETE");
}

main().catch((e) => {
  console.error("SEED FAILED:", e.message);
  process.exit(1);
});
