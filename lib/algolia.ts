import { algoliasearch } from 'algoliasearch';
// Algolia v5. Requires ALGOLIA_APP_ID + ALGOLIA_SEARCH_API_KEY (search key, not admin).
// If env is missing, callers fall back to the Supabase catalog - never crash the build.
export function getAlgoliaClient() {
  const appId = process.env.ALGOLIA_APP_ID;
  const apiKey = process.env.ALGOLIA_SEARCH_API_KEY || process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY;
  if (!appId || !apiKey) return null;
  return algoliasearch(appId, apiKey);
}
export async function searchAlgolia(query: string, indexName = 'unsaid_products', hitsPerPage = 25) {
  const client = getAlgoliaClient(); if (!client) return null;
  const res = await client.search({ requests: [{ indexName, query, hitsPerPage }] });
  return (res.results[0] as any)?.hits ?? [];
}
