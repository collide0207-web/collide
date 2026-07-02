import type { Api } from './types'
import { mockApi } from './mockApi'

/**
 * Single seam between UI and backend. Today it's the mock; later, export an
 * httpApi (fetch-based, hits Spring Boot) and switch here — components don't change.
 */
export const api: Api = mockApi
