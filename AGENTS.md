<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project conventions

## Data-fetching & caching
- **Shared, non-user-specific reads** (catalog/search/aggregations that are the same for everyone and change rarely) → wrap in `unstable_cache` with an explicit cache key **and a tag**, like `getShellData` (`src/lib/shell-data.ts`), `getProductCosts` (`airtable/prices.ts`), `getSakeCatalog`. Revalidate the tag after a sync. **Bump the cache key (`…-v2`)** whenever the cached object's *shape* changes, or stale-shaped objects keep being served across deploys.
- **User-specific reads** (anything that depends on the signed-in user / request cookies) → do NOT cache; `unstable_cache` runs without request context.
- **Mutations / server actions** (`"use server"` writes) → never wrap in `unstable_cache`; call `revalidatePath`/`revalidateTag` after the write so cached readers refresh.

## Italian months
One source of truth: `src/lib/dates/italian-months.ts` (`MONTH_NAMES_IT`, `MONTH_TO_NUM`, `monthIndexIt`, `parseItDate`). Do not redefine month maps/arrays locally.

## External URLs & secrets
- Provider API base URLs are env-overridable with a fallback to the real endpoint (`ANTHROPIC_API_URL`, `OPENAI_API_URL`, `RESEND_API_URL`, `AIRTABLE_API_URL`) — leave unset in normal use.
- The Shopify **admin** store slug is account-specific: build admin links via `shopifyAdminProductsUrl()` (`src/lib/integrations/shopify/admin-url.ts`), configurable with `NEXT_PUBLIC_SHOPIFY_STORE_SLUG`.
- **Never log secrets** (OAuth access tokens, API keys) to the server console — they persist in the Render production logs. Log identifiers/scopes only.
