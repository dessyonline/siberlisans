# Plan: Storage Migration & Offline Support

The user wants to store data somewhere other than Lovable Cloud (Supabase). Since the Lovable Cloud backend is currently paused and the user specifically requested "cloud harici bir yerde depolamak" (store somewhere other than cloud), we will implement a Local Storage / IndexedDB fallback system while maintaining the UI.

## Proposed Changes

### 1. Data Layer Abstraction
- Create a `src/lib/storage.ts` abstraction that handles CRUD operations.
- By default, it will attempt to use a local persistence layer (IndexedDB via `idb-keyval` or simple `localStorage`) if the Cloud backend is unreachable.
- Seed the local storage with initial demo data so the site looks "alive" even when the database is paused.

### 2. UI Updates
- Add a "Local Mode" indicator in the header if the backend is unreachable.
- Ensure product listings, search, and the "AI Tools" work using local state when the API fails.

### 3. Authentication Fallback
- Implement a "Guest Session" or "Local Account" for when Supabase Auth is unavailable.

## Technical Details
- Use `idb-keyval` for structured storage if available, fallback to `localStorage`.
- Intercept `supabase` calls in key components or provide a wrapper hook `useData` that handles the switch.
- The plan will focus on making the app functional locally so the user can continue development/testing without waiting for Cloud resumption.

## Security & Constraints
- Local storage is per-browser.
- This is a temporary measure to bypass the "Paused" state and fulfill the user's specific request for non-cloud storage.

Please approve this plan to proceed with the migration to a local-first architecture.
