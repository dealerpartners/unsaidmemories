// The @payload-config module is a webpack alias set up by the withPayload plugin.
// At runtime, the plugin transforms the import — the actual type depends on
// Payload's internal processing. Using `any` here matches the runtime behavior
// (the withPayload plugin handles the config resolution at build time).
declare module "@payload-config" {
  const config: any;
  export default config;
}
