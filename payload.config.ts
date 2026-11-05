import { buildConfig, type Field } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

// The link shape the payload schema was actually built with (the
// link_* columns on pages_hero_links / pages_blocks_cta_links /
// pages_blocks_content_columns, references carried in pages_rels).
// Declaring any field whose column does not exist makes Payload's
// find fail with a generic 500 — every field declared in this file
// must map to a real column or a rels-table path. (Drift between
// this config and the CP1-built schema is what broke the pages and
// posts APIs; diagnosed 2026-11-03.)
const linkFields: Field[] = [
  { name: "type", type: "select", options: ["reference", "custom"], defaultValue: "custom" },
  { name: "newTab", type: "checkbox" },
  { name: "reference", type: "relationship", relationTo: ["pages", "posts"] },
  { name: "url", type: "text" },
  { name: "label", type: "text" },
  { name: "appearance", type: "select", options: ["default", "outline"], defaultValue: "default" },
];

// ============================================================================
// Payload CMS Configuration — Unsaid Memories
// ============================================================================
// Points at the EXISTING payload.* schema in Supabase (68 tables from a
// previous installation). push: false means Payload will NOT modify the
// schema — it reads and writes to the tables as they exist today.
//
// The admin mounts at /cms-admin (NOT /admin, which is the Unsaid admin).
// The REST/GraphQL API mounts at /api/payload.
//
// PAYLOAD_SECRET must be set in the environment (Vercel deploy secret).
// The database connection comes from UNSAID_DATABASE_URL (already set).
// ============================================================================

export default buildConfig({
  admin: {
    // Mount Payload's admin panel at /cms-admin — NOT /admin (taken by Unsaid)
    autoLogin: false,
    disable: false,
    // CRITICAL: importMap.baseDir tells Payload where to generate the importMap.js
    // file. Without this, withPayload can't create the component map and the
    // admin UI can't render. Lifted from the Payload template pattern.
    importMap: {
      baseDir: path.resolve(dirname),
    },
    routes: {
      login: "/cms-admin/login",
      logout: "/cms-admin/logout",
      forgot: "/cms-admin/forgot",
      reset: "/cms-admin/reset",
    },
    livePreview: {
      breakpoints: [
        { label: "Mobile", name: "mobile", width: 375, height: 812 },
        { label: "Desktop", name: "desktop", width: 1440, height: 900 },
      ],
    },
    meta: {
      title: "Unsaid CMS",
      description: "Experience Studio — Content Management System",
      icons: [
        { rel: "icon", type: "image/png", url: "/favicon-32x32.png" },
      ],
    },
  },

  secret: process.env.PAYLOAD_SECRET || "unsaid-payload-dev-secret-change-in-prod",

  sharp,

  db: postgresAdapter({
    pool: {
      // Fix the Supabase pooler hostname: stale naming "aws-0-useast-1" doesn't
      // resolve; the correct hostname is "aws-0-us-east-1" (with hyphens).
      // Same correction as src/lib/pg.ts.
      //
      // The connection otherwise goes to the pooler EXACTLY as the app's
      // own data layer uses it (session mode). An earlier rewrite sent
      // Payload to the transaction pooler (:6543) instead; transaction
      // mode breaks Payload's init (prepared statements / session state)
      // while the app's session-pooler path works — production answered
      // every /api/payload/* call with a generic 500 while the payload
      // schema sat intact (68 tables, pages row present). Diagnosis
      // 2026-11-03; if the 500 persists on the session pooler, the cause
      // is elsewhere and the runtime log will say so.
      connectionString: (process.env.UNSAID_DATABASE_URL || "")
        .replace("useast-1", "us-east-1"),
    },
    // CRITICAL: push=false means Payload will NOT alter the existing schema.
    // The 68 payload.* tables were created by a previous installation and
    // must not be migrated. Payload reads/writes to them as-is.
    push: false,
    // The schema name where Payload's tables live
    schemaName: "payload",
  }),

  // Top-level routes — the REST API path (separate from admin.routes)
  routes: {
    api: "/api/payload",
  },

  // The stored rich text in the payload schema is Lexical format
  // (every value begins {"root": ...}); the Slate editor threw on
  // read for any document carrying rich text — that was the pages
  // 500. Lexical is the editor the data was written for.
  editor: lexicalEditor({}),

  collections: [
    // --- Pages (the core content collection) ---
    {
      slug: "pages",
      admin: {
        useAsTitle: "title",
        defaultColumns: ["title", "slug", "_status"],
        group: "Content",
      },
      access: {
        read: () => true,
      },
      fields: [
        { name: "title", type: "text", required: true },
        { name: "slug", type: "text", unique: true },
        { name: "publishedAt", type: "date", admin: { position: "sidebar" } },
        {
          name: "hero",
          type: "group",
          fields: [
            { name: "type", type: "select", options: ["none", "highImpact", "media", "form"] },
            { name: "richText", type: "richText" },
            { name: "media", type: "relationship", relationTo: "media" },
            { name: "links", type: "array", fields: linkFields },
          ],
        },
        {
          // Named "layout": the existing block rows live under
          // _path "layout" in pages_blocks_* (and "version.layout"
          // in _pages_v_blocks_*).
          name: "layout",
          type: "blocks",
          blocks: [
            // Content block — columns carry the rich text (the
            // block itself has no rich_text column).
            {
              slug: "content",
              fields: [
                { name: "columns", type: "array", fields: [
                  { name: "size", type: "select", options: ["full", "half", "oneThird", "twoThirds"] },
                  { name: "richText", type: "richText" },
                  { name: "enableLink", type: "checkbox" },
                  { name: "link", type: "group", fields: linkFields },
                ]},
              ],
            },
            // CTA block
            {
              slug: "cta",
              fields: [
                { name: "richText", type: "richText" },
                { name: "links", type: "array", fields: linkFields },
              ],
            },
            // Media block (no caption column exists — do not declare one)
            {
              slug: "mediaBlock",
              fields: [
                { name: "media", type: "relationship", relationTo: "media" },
              ],
            },
            // Archive block
            {
              slug: "archive",
              fields: [
                { name: "introContent", type: "richText" },
                { name: "populateBy", type: "select", options: ["collection", "selection"], defaultValue: "collection" },
                { name: "relationTo", type: "select", options: ["posts", "pages", "categories"] },
                { name: "categories", type: "relationship", relationTo: "categories", hasMany: true },
                { name: "limit", type: "number", defaultValue: 10 },
              ],
            },
            // Form block
            {
              slug: "formBlock",
              fields: [
                { name: "form", type: "relationship", relationTo: "forms" },
                { name: "enableIntro", type: "checkbox" },
                { name: "introContent", type: "richText" },
              ],
            },
          ],
        },
        { name: "metaTitle", type: "text" },
        { name: "metaDescription", type: "textarea" },
        { name: "metaImage", type: "relationship", relationTo: "media" },
      ],
      versions: {
        drafts: true,
      },
    },

    // --- Media (image library with auto-resizing) ---
    {
      slug: "media",
      admin: {
        useAsTitle: "alt",
        defaultColumns: ["alt", "filename", "mime_type", "width", "height"],
        group: "Assets",
      },
      access: {
        read: () => true,
      },
      upload: {
        imageSizes: [
          { name: "thumbnail", width: 200, height: 200, position: "centre" },
          { name: "square", width: 500, height: 500, position: "centre" },
          { name: "small", width: 600 },
          { name: "medium", width: 1000 },
          { name: "large", width: 1400 },
          { name: "xlarge", width: 2000 },
          { name: "og", width: 1200, height: 630, position: "centre" },
        ],
        focalPoint: true,
      },
      fields: [
        { name: "alt", type: "text", required: true },
        { name: "caption", type: "richText" },
      ],
    },

    // --- Posts (blog/editorial content) ---
    {
      slug: "posts",
      admin: {
        useAsTitle: "title",
        defaultColumns: ["title", "_status", "publishedAt"],
        group: "Content",
      },
      access: {
        read: () => true,
      },
      fields: [
        { name: "title", type: "text", required: true },
        { name: "heroImage", type: "relationship", relationTo: "media" },
        { name: "content", type: "richText" },
        { name: "authors", type: "relationship", relationTo: "users", hasMany: true },
        { name: "categories", type: "relationship", relationTo: "categories", hasMany: true },
        { name: "populatedAuthors", type: "array", fields: [
          { name: "id", type: "text" },
          { name: "name", type: "text" },
        ]},
        { name: "slug", type: "text" },
        { name: "publishedAt", type: "date", admin: { position: "sidebar" } },
      ],
      versions: {
        drafts: true,
      },
    },

    // --- Categories (taxonomy) ---
    {
      slug: "categories",
      admin: {
        useAsTitle: "title",
        defaultColumns: ["title", "parent"],
        group: "Content",
      },
      access: {
        read: () => true,
      },
      fields: [
        { name: "title", type: "text", required: true },
        { name: "parent", type: "relationship", relationTo: "categories" },
        { name: "breadcrumbs", type: "array", fields: [
          { name: "label", type: "text" },
          { name: "url", type: "text" },
          { name: "id", type: "text" },
        ]},
      ],
    },

    // --- Banners (custom collection — existing payload.banners table) ---
    {
      slug: "banners",
      admin: {
        useAsTitle: "title",
        defaultColumns: ["title", "placement", "status"],
        group: "Commerce CMS",
      },
      access: {
        read: () => true,
      },
      fields: [
        { name: "placement", type: "text", required: true },
        { name: "placementLabel", type: "text" },
        { name: "title", type: "text" },
        { name: "body", type: "textarea" },
        { name: "ctaLabel", type: "text" },
        { name: "ctaHref", type: "text" },
        { name: "bgColor", type: "text", defaultValue: "#23212b" },
        { name: "textColor", type: "text", defaultValue: "#ffffff" },
        { name: "imageUrl", type: "text" },
        { name: "imageSource", type: "select", options: ["upload", "pollinations", "media"], defaultValue: "upload" },
        { name: "imagePrompt", type: "text" },
        { name: "status", type: "select", options: ["draft", "published"], defaultValue: "draft" },
        { name: "startsAt", type: "date" },
        { name: "endsAt", type: "date" },
        { name: "dismissible", type: "checkbox", defaultValue: true },
      ],
    },

    // --- Popups (custom collection — existing payload.popups table) ---
    {
      slug: "popups",
      admin: {
        useAsTitle: "title",
        defaultColumns: ["title", "placement", "status"],
        group: "Commerce CMS",
      },
      access: {
        read: () => true,
      },
      fields: [
        { name: "placement", type: "text", required: true },
        { name: "placementLabel", type: "text" },
        { name: "title", type: "text" },
        { name: "body", type: "textarea" },
        { name: "ctaLabel", type: "text" },
        { name: "ctaHref", type: "text" },
        { name: "bgColor", type: "text", defaultValue: "#23212b" },
        { name: "textColor", type: "text", defaultValue: "#ffffff" },
        { name: "imageUrl", type: "text" },
        { name: "imageSource", type: "select", options: ["upload", "pollinations", "media"], defaultValue: "upload" },
        { name: "imagePrompt", type: "text" },
        { name: "status", type: "select", options: ["draft", "published"], defaultValue: "draft" },
        { name: "startsAt", type: "date" },
        { name: "endsAt", type: "date" },
        { name: "triggerType", type: "select", options: ["time", "scroll", "exit"] },
        { name: "triggerValue", type: "number" },
        { name: "frequency", type: "select", options: ["always", "once", "oncePerSession"] },
        { name: "form", type: "relationship", relationTo: "forms" },
        { name: "showOnMobile", type: "checkbox", defaultValue: true },
        { name: "dismissible", type: "checkbox", defaultValue: true },
      ],
    },

    // --- Forms (form builder) ---
    {
      slug: "forms",
      admin: {
        useAsTitle: "title",
        defaultColumns: ["title"],
        group: "Content",
      },
      access: {
        read: () => true,
      },
      fields: [
        { name: "title", type: "text", required: true },
        {
          name: "fields",
          type: "blocks",
          blocks: [
            { slug: "text", fields: [{ name: "label", type: "text", required: true }, { name: "name", type: "text", required: true }, { name: "required", type: "checkbox" }] },
            { slug: "textarea", fields: [{ name: "label", type: "text", required: true }, { name: "name", type: "text", required: true }, { name: "required", type: "checkbox" }] },
            { slug: "email", fields: [{ name: "label", type: "text", required: true }, { name: "name", type: "text", required: true }, { name: "required", type: "checkbox" }] },
            { slug: "number", fields: [{ name: "label", type: "text", required: true }, { name: "name", type: "text", required: true }, { name: "required", type: "checkbox" }] },
            { slug: "select", fields: [{ name: "label", type: "text", required: true }, { name: "name", type: "text", required: true }, { name: "options", type: "array", fields: [{ name: "label", type: "text" }] }] },
            { slug: "checkbox", fields: [{ name: "label", type: "text", required: true }, { name: "name", type: "text", required: true }] },
            { slug: "country", fields: [{ name: "label", type: "text", required: true }, { name: "name", type: "text", required: true }] },
            { slug: "state", fields: [{ name: "label", type: "text", required: true }, { name: "name", type: "text", required: true }] },
            { slug: "message", fields: [{ name: "message", type: "textarea" }] },
          ],
        },
        {
          name: "emails",
          type: "array",
          fields: [
            { name: "emailTo", type: "text" },
            { name: "subject", type: "text" },
            { name: "message", type: "textarea" },
          ],
        },
      ],
    },

    // --- Form Submissions ---
    {
      slug: "form-submissions",
      admin: {
        useAsTitle: "form",
        group: "Content",
      },
      access: {
        read: () => true,
      },
      fields: [
        { name: "form", type: "relationship", relationTo: "forms" },
        { name: "submissionData", type: "array", fields: [
          { name: "field", type: "text" },
          { name: "value", type: "text" },
        ]},
      ],
    },

    // --- Redirects ---
    {
      slug: "redirects",
      admin: {
        useAsTitle: "from",
        defaultColumns: ["from", "to"],
        group: "Infrastructure",
      },
      access: {
        read: () => true,
      },
      fields: [
        { name: "from", type: "text", required: true },
        {
          name: "to",
          type: "group",
          fields: [
            { name: "type", type: "select", options: ["reference", "custom"] },
            { name: "url", type: "text" },
          ],
        },
      ],
    },
  ],

  globals: [
    // --- Header (site-wide navigation) ---
    {
      slug: "header",
      access: {
        read: () => true,
      },
      fields: [
        {
          name: "navItems",
          type: "array",
          fields: [
            { name: "label", type: "text", required: true },
            { name: "url", type: "text" },
            { name: "type", type: "select", options: ["internal", "external"] },
            {
              name: "subItems",
              type: "array",
              fields: [
                { name: "label", type: "text" },
                { name: "url", type: "text" },
              ],
            },
          ],
        },
      ],
    },

    // --- Footer (site-wide footer) ---
    {
      slug: "footer",
      access: {
        read: () => true,
      },
      fields: [
        {
          name: "navItems",
          type: "array",
          fields: [
            { name: "label", type: "text", required: true },
            { name: "url", type: "text" },
            { name: "type", type: "select", options: ["internal", "external"] },
          ],
        },
      ],
    },
  ],

  // TypeScript generation — Payload generates types from the config
  typescript: {
    outputFile: path.resolve(process.cwd(), "src/payload-types.ts"),
  },

  // CORS — allow the storefront to read Payload's API
  cors: ["https://unsaid-theta.vercel.app", "http://localhost:3000"],
  csrf: ["https://unsaid-theta.vercel.app", "http://localhost:3000"],
});
