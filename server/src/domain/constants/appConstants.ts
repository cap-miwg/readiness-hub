/**
 * App-level constants ported from v1 ConfigConstants.html via the mechanical
 * extraction in v1-constants.json (docs/ARCHITECTURE.md: one audited
 * conversion layer, never hand-retyped).
 */
import v1 from './v1-constants.json' with { type: 'json' }

/** The last v1 release these rules were ported from. */
export const V1_APP_VERSION: string = v1.APP_VERSION

export interface AppConfig {
  appName: string
  appShortName: string
  logoUrl: string
}

export const APP_CONFIG: AppConfig = v1.APP_CONFIG

export interface FeedbackCategory {
  id: string
  label: string
  icon: string
  description: string
}

export const FEEDBACK_CATEGORIES: readonly FeedbackCategory[] = v1.FEEDBACK_CATEGORIES

/** v1 client pagination size (ConfigConstants.html DATA_CONSTANTS). The v1
 * cache key and max-age have no v2 equivalent (server-side data). */
export const ITEMS_PER_PAGE: number = v1.DATA_CONSTANTS.ITEMS_PER_PAGE
