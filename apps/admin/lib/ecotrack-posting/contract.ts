import type { getDb } from '@bric/db/client';
import { orders } from '@bric/db/schema';
import { type EcotrackExtendedRateLimitSnapshot } from '@bric/storefront-core/ecotrack-client';
import { type EcotrackProvider } from '../ecotrack-provider';
import { type OrderRecord } from '../orders';

export type Database = ReturnType<typeof getDb>;

export const ECOTRACK_PLACEHOLDER_ADDRESS = 'Adresse non renseignee';

type EcotrackPreviewReason =
  | 'already_posted'
  | 'status_not_confirmed'
  | 'missing_name'
  | 'missing_phone'
  | 'missing_wilaya'
  | 'missing_commune'
  | 'invalid_commune'
  | 'missing_address';

export type EcotrackOrderPayload = {
  reference: string;
  nom_client: string;
  telephone: string;
  telephone_2?: string;
  adresse: string;
  code_postal?: string;
  commune: string;
  code_wilaya: string;
  montant: string;
  remarque?: string;
  produit?: string;
  type: '1';
  stop_desk: 0 | 1;
};

export type EcotrackOrderPreviewItem = {
  orderId: number;
  customerName: string;
  destination: string;
  amount: string;
  payload: EcotrackOrderPayload;
};

export type EcotrackOrderSkipItem = {
  orderId: number;
  customerName: string;
  reason: 'already_posted';
};

export type EcotrackOrderInvalidItem = {
  orderId: number;
  customerName: string;
  reason: Exclude<EcotrackPreviewReason, 'already_posted'>;
  message: string;
};

export type EcotrackCreateOrderResult = {
  success: boolean;
  tracking: string | null;
  message: string | null;
  raw: unknown;
};

export type EcotrackPostingResultItem = {
  orderId: number;
  reference: string;
  tracking: string | null;
  status: 'skipped' | 'invalid' | 'created' | 'failed';
  failureKind?: 'provider_rejected' | 'recovery_required' | 'not_sent';
  message: string;
};

export type EcotrackPostingSummary = {
  provider: EcotrackProvider;
  totalRequested: number;
  eligible: number;
  created: number;
  skippedAlreadyPosted: number;
  invalid: number;
  failed: number;
  rateLimits: EcotrackExtendedRateLimitSnapshot[];
  results: EcotrackPostingResultItem[];
};

export type EcotrackOrderInput = {
  row: typeof orders.$inferSelect;
  record: OrderRecord;
};

export type EcotrackPreviewResult = {
  totalRequested: number;
  eligible: EcotrackOrderPreviewItem[];
  skipped: EcotrackOrderSkipItem[];
  invalid: EcotrackOrderInvalidItem[];
};
