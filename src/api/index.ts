import type { Api } from './types'
import { mockApi } from './mockApi'
import { httpApi } from './httpApi'

/**
 * Single seam between UI and backend. When VITE_API_URL is set we talk to the real
 * Spring Boot control plane (httpApi); otherwise we use the in-memory mock so the UI
 * runs with no backend. Components import `api` and never care which is active.
 */
export const api: Api = import.meta.env.VITE_API_URL ? httpApi : mockApi
