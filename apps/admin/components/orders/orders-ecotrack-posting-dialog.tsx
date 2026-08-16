'use client';

import { useTranslations } from 'next-intl';

import type { ExportProgressState } from './orders-export-dialog';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
type EcotrackOrderPayload = {
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
type EcotrackPreviewItem = {
  orderId: number;
  customerName: string;
  destination: string;
  amount: string;
  payload: EcotrackOrderPayload;
};
type EcotrackPreviewSkipItem = {
  orderId: number;
  customerName: string;
  reason: 'already_posted';
};
type EcotrackPreviewInvalidItem = {
  orderId: number;
  customerName: string;
  reason:
    | 'status_not_confirmed'
    | 'missing_phone'
    | 'missing_wilaya'
    | 'missing_commune'
    | 'invalid_commune'
    | 'missing_address'
    | 'missing_name';
  message: string;
};
export type EcotrackPreviewResponse = {
  totalRequested: number;
  eligible: EcotrackPreviewItem[];
  skipped: EcotrackPreviewSkipItem[];
  invalid: EcotrackPreviewInvalidItem[];
};
type EcotrackPostingResultItem = {
  orderId: number;
  reference: string;
  tracking: string | null;
  status: 'skipped' | 'invalid' | 'created' | 'failed';
  message: string;
};
export type EcotrackPostingSummary = {
  totalRequested: number;
  eligible: number;
  created: number;
  skippedAlreadyPosted: number;
  invalid: number;
  failed: number;
  rateLimits: Array<Record<string, unknown>>;
  results: EcotrackPostingResultItem[];
};
export type EcotrackPostingPreviewState = {
  mode: 'selected' | 'confirmed';
  provider: 'delivro' | 'emir';
  title: string;
  orderIds: number[];
  preview: EcotrackPreviewResponse;
} | null;

export function EcotrackPostingDialog({
  state,
  progress,
  postingSummary,
  onOpenChange,
  onConfirm,
  onCancelJob,
}: {
  state: EcotrackPostingPreviewState;
  progress: ExportProgressState;
  postingSummary: EcotrackPostingSummary | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancelJob: () => void;
}) {
  const t = useTranslations();
  const pending = progress !== null;
  const preview = state?.preview ?? null;
  const summary = postingSummary;

  return (
    <Dialog open={Boolean(state)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-5xl">
        <DialogHeader className="shrink-0 border-b border-border/70 pb-4">
          <DialogTitle>{state?.title ?? t('ordersManager.ecotrack.previewTitle')}</DialogTitle>
        </DialogHeader>
        {preview ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-4">
            {progress ? (
              <div className="rounded-2xl border border-border/70 p-4">
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span>{t(`ordersManager.ecotrack.progress.${progress.phase}`)}</span>
                  <span>
                    {progress.current}/{progress.total}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground transition-all"
                    style={{
                      width: `${progress.total === 0 ? 0 : (progress.current / progress.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-4">
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">
                  {t('ordersManager.ecotrack.summary.totalRequested')}
                </p>
                <p className="mt-1 text-lg font-semibold">{preview.totalRequested}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">
                  {t('ordersManager.ecotrack.summary.eligible')}
                </p>
                <p className="mt-1 text-lg font-semibold">{preview.eligible.length}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">
                  {t('ordersManager.ecotrack.summary.skipped')}
                </p>
                <p className="mt-1 text-lg font-semibold">{preview.skipped.length}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">
                  {t('ordersManager.ecotrack.summary.invalid')}
                </p>
                <p className="mt-1 text-lg font-semibold">{preview.invalid.length}</p>
              </Card>
            </div>

            <div className="rounded-2xl border border-border/70 p-4">
              <p className="mb-3 text-sm font-medium">
                {t('ordersManager.ecotrack.previewEligible')}
              </p>
              <div className="flex flex-col gap-3">
                {preview.eligible.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('ordersManager.ecotrack.emptyEligible')}
                  </p>
                ) : null}
                {preview.eligible.map((item) => (
                  <div key={item.orderId} className="rounded-xl border border-border/70 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        #{item.orderId} {item.customerName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {item.destination} • {item.amount}
                      </p>
                    </div>
                    <pre className="mt-3 overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs">
                      {JSON.stringify(item.payload, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border/70 p-4">
                <p className="mb-3 text-sm font-medium">
                  {t('ordersManager.ecotrack.previewSkipped')}
                </p>
                <div className="flex flex-col gap-2">
                  {preview.skipped.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t('ordersManager.ecotrack.emptySkipped')}
                    </p>
                  ) : null}
                  {preview.skipped.map((item) => (
                    <div
                      key={`skip-${item.orderId}`}
                      className="rounded-lg border border-border/70 p-3 text-sm"
                    >
                      #{item.orderId} {item.customerName} •{' '}
                      {t(`ordersManager.ecotrack.reasons.${item.reason}`)}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-border/70 p-4">
                <p className="mb-3 text-sm font-medium">
                  {t('ordersManager.ecotrack.previewInvalid')}
                </p>
                <div className="flex flex-col gap-2">
                  {preview.invalid.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t('ordersManager.ecotrack.emptyInvalid')}
                    </p>
                  ) : null}
                  {preview.invalid.map((item) => (
                    <div
                      key={`invalid-${item.orderId}`}
                      className="rounded-lg border border-border/70 p-3 text-sm"
                    >
                      <p>
                        #{item.orderId} {item.customerName}
                      </p>
                      <p className="text-muted-foreground">
                        {t(`ordersManager.ecotrack.reasons.${item.reason}`)} • {item.message}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {summary ? (
              <div className="rounded-2xl border border-border/70 p-4">
                <p className="mb-3 text-sm font-medium">
                  {t('ordersManager.ecotrack.resultTitle')}
                </p>
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <Badge variant="outline">
                    {t('ordersManager.ecotrack.summary.created')}: {summary.created}
                  </Badge>
                  <Badge variant="outline">
                    {t('ordersManager.ecotrack.summary.failed')}: {summary.failed}
                  </Badge>
                  <Badge variant="outline">
                    {t('ordersManager.ecotrack.summary.skipped')}: {summary.skippedAlreadyPosted}
                  </Badge>
                  <Badge variant="outline">
                    {t('ordersManager.ecotrack.summary.invalid')}: {summary.invalid}
                  </Badge>
                  <Badge variant="outline">
                    {t('ordersManager.ecotrack.summary.eligible')}: {summary.eligible}
                  </Badge>
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  {summary.results.map((item) => (
                    <div
                      key={`${item.reference}-${item.status}-${item.tracking ?? 'none'}`}
                      className="rounded-lg border border-border/70 p-3 text-sm"
                    >
                      #{item.orderId} • {item.status} {item.tracking ? `• ${item.tracking}` : ''}{' '}
                      {item.message ? `• ${item.message}` : ''}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        <DialogFooter className="sticky bottom-0 shrink-0 border-t border-border/70 bg-background pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t('actions.cancel')}
          </Button>
          {pending ? (
            <Button type="button" variant="outline" onClick={onCancelJob}>
              {t('actions.cancel')}
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={pending || !state || preview?.eligible.length === 0}
            onClick={onConfirm}
          >
            {t('ordersManager.ecotrack.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
