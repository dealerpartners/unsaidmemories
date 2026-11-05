/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
import config from "@payload-config";
import "@payloadcms/next/css";
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from "@payloadcms/next/routes";

// Cast to any — Payload REST handlers return typed functions that don't
// match Next.js 16's RouteHandlerConfig constraint. This is a known type
// compatibility issue between Payload 3.92.1 and Next.js 16.
export const GET = REST_GET(config) as any;
export const POST = REST_POST(config) as any;
export const DELETE = REST_DELETE(config) as any;
export const PATCH = REST_PATCH(config) as any;
export const PUT = REST_PUT(config) as any;
export const OPTIONS = REST_OPTIONS(config) as any;
