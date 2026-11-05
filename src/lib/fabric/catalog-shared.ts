/**
 * Small shared helpers between the studio catalog API and the editor:
 * the kind → editor product-type mapping lives in templates.ts; this
 * re-export keeps API routes from importing the heavier template module
 * on the server hot path. (Client components import templates.ts
 * directly — it is pure.)
 */
export { classifyKind } from "./templates";
import type { TemplateKind } from "./templates";
import type { ProductType } from "@/lib/admin/product-templates";

export const KIND_TO_PRODUCT_TYPE_FALLBACK: Record<TemplateKind, ProductType> = {
  tee: "Classic Tee",
  hoodie: "Premium Hoodie",
  sweatshirt: "Crewneck Sweatshirt",
  mug: "Ceramic Mug",
  tumbler: "Insulated Tumbler",
  cup: "Enamel Cup",
  tote: "Tote Bag",
  poster: "Poster",
  generic: "Classic Tee",
};
