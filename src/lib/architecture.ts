// Typed accessors for the parsed architecture data.
// JSON is imported with `resolveJsonModule` — types are inferred at runtime,
// we layer a thin typed wrapper on top for ergonomic access in components.

import domainsData from "@/data/architecture/domains.json";
import modalsData from "@/data/architecture/modals.json";
import componentsData from "@/data/architecture/components.json";
import featureMapData from "@/data/architecture/feature-map.json";

export type Endpoint = {
  endpoint: string;
  method: string;
  auth: string;
  authorization: string;
  idempotent: string;
  rate: string;
  request_schema?: string;
  response_schema?: string;
  response?: string;
};

export type ImplementationContract = {
  actors?: string;
  authorization?: string;
  tenant_scope?: string;
  primary_entities?: string;
  database_references?: string;
  async_jobs?: string;
  events_emitted?: string;
  audit_events?: string;
  privacy_classification?: string;
};

export type Domain = {
  code: string;
  name: string;
  owner: string;
  endpoints: Endpoint[];
  contract: ImplementationContract;
};

export const domains: Domain[] = domainsData as Domain[];

export type ModalField = {
  type?: string;
  trigger?: string;
  purpose?: string;
  props?: string;
  fields?: string;
  validation?: string;
  actions?: string;
  api?: string;
  states?: string;
  rules?: string;
  response?: string;
  idempotency?: string;
  audit?: string;
};

export type Modal = {
  name: string;
  fields: ModalField;
};

export const modals: Modal[] = modalsData as Modal[];

export type ComponentTypeDefinition = {
  type: string;
  examples: string;
  document_at: string;
  purpose: string;
};

export type ArchitectureComponent = {
  component: string;
  type: string;
  purpose: string;
  used_by: string;
  dependencies: string;
  owner: string;
};

export type ComponentCatalog = {
  context: string;
  components: ArchitectureComponent[];
};

export type ComponentsData = {
  type_definitions: ComponentTypeDefinition[];
  catalogs: ComponentCatalog[];
};

export const componentTypeDefinitions: ComponentTypeDefinition[] = (
  componentsData as ComponentsData
).type_definitions;

export const componentCatalogs: ComponentCatalog[] = (
  componentsData as ComponentsData
).catalogs;

export type FeatureMapEntry = {
  feature: string;
  page_per_workflow: string;
  modal: string;
  domain_owner: string;
  api_operation: string;
  primary_entity: string;
};

export const featureMap: FeatureMapEntry[] =
  featureMapData as FeatureMapEntry[];

// Helpers ---------------------------------------------------------------------

export function getDomain(code: string): Domain | undefined {
  return domains.find((d) => d.code.toLowerCase() === code.toLowerCase());
}

export function domainSlug(d: Domain): string {
  return d.code.toLowerCase();
}

export function parseMethodColor(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "text-emerald-700 dark:text-emerald-400";
    case "POST":
      return "text-blue-700 dark:text-blue-400";
    case "PUT":
    case "PATCH":
      return "text-amber-700 dark:text-amber-400";
    case "DELETE":
      return "text-rose-700 dark:text-rose-400";
    case "WS":
      return "text-purple-700 dark:text-purple-400";
    default:
      return "text-muted-foreground";
  }
}

// Quick stats for headers / landing.

export const architectureStats = {
  domainCount: domains.length,
  endpointCount: domains.reduce((n, d) => n + d.endpoints.length, 0),
  modalCount: modals.length,
  componentCount: componentCatalogs.reduce(
    (n, c) => n + c.components.length,
    0,
  ),
  componentTypeCount: componentTypeDefinitions.length,
  catalogCount: componentCatalogs.length,
  featureMapCount: featureMap.length,
};
