'use client';
import { useTranslations } from 'next-intl';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog';
import {
  type EcotrackPostingPreviewState,
  type EcotrackPostingSummary,
  type ExportProgressState,
} from '../orders-workflow-model';

export function EcotrackPostingWorkspaceDialog({
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
  const preview = state?.preview ?? null;
  const pending = progress !== null;

  return (
    <Dialog open={Boolean(state)} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] max-w-none flex-col overflow-hidden rounded-xl p-0 sm:h-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-[var(--shape-radius-overlay)]">
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4">
          <DialogTitle>{state?.title ?? t('ordersManager.ecotrack.previewTitle')}</DialogTitle>
        </DialogHeader>
        {preview ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {progress ? (
              <div className="border-b border-border/60 px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span>{t(`ordersManager.ecotrack.progress.${progress.phase}`)}</span>
                  <span className="tabular-nums">
                    {progress.current}/{progress.total}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-[width]"
                    style={{
                      width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}

            <dl className="grid grid-cols-2 border-b border-border/60 sm:grid-cols-4">
              {[
                [t('ordersManager.ecotrack.summary.totalRequested'), preview.totalRequested],
                [t('ordersManager.ecotrack.summary.eligible'), preview.eligible.length],
                [t('ordersManager.ecotrack.summary.skipped'), preview.skipped.length],
                [t('ordersManager.ecotrack.summary.invalid'), preview.invalid.length],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="border-e border-border/50 px-4 py-3 last:border-e-0"
                >
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>

            <section>
              <h3 className="border-b border-border/50 bg-muted/15 px-4 py-2.5 text-sm font-semibold">
                {t('ordersManager.ecotrack.previewEligible')}
              </h3>
              {preview.eligible.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">
                  {t('ordersManager.ecotrack.emptyEligible')}
                </p>
              ) : (
                <div className="divide-y divide-border/50">
                  {preview.eligible.map((item) => (
                    <div key={item.orderId} className="px-4 py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium">
                          #{item.orderId} · {item.customerName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {item.destination} · {item.amount}
                        </p>
                      </div>
                      <details className="mt-2 text-xs text-muted-foreground">
                        <summary className="cursor-pointer select-none">
                          {t('adminWorkspace.orders.payloadDetails')}
                        </summary>
                        <pre className="mt-2 overflow-x-auto border-s border-border/60 ps-3">
                          {JSON.stringify(item.payload, null, 2)}
                        </pre>
                      </details>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {preview.skipped.length > 0 || preview.invalid.length > 0 ? (
              <section className="grid border-t border-border/60 md:grid-cols-2">
                <div className="border-border/60 md:border-e">
                  <h3 className="border-b border-border/50 px-4 py-2.5 text-sm font-semibold">
                    {t('ordersManager.ecotrack.previewSkipped')}
                  </h3>
                  {preview.skipped.map((item) => (
                    <p key={item.orderId} className="border-b border-border/40 px-4 py-3 text-sm">
                      #{item.orderId} · {item.customerName} ·{' '}
                      <span className="text-muted-foreground">
                        {t(`ordersManager.ecotrack.reasons.${item.reason}`)}
                      </span>
                    </p>
                  ))}
                </div>
                <div>
                  <h3 className="border-b border-border/50 px-4 py-2.5 text-sm font-semibold">
                    {t('ordersManager.ecotrack.previewInvalid')}
                  </h3>
                  {preview.invalid.map((item) => (
                    <p key={item.orderId} className="border-b border-border/40 px-4 py-3 text-sm">
                      #{item.orderId} · {item.customerName} ·{' '}
                      <span className="text-destructive">{item.message}</span>
                    </p>
                  ))}
                </div>
              </section>
            ) : null}

            {postingSummary ? (
              <section className="border-t border-border/60">
                <h3 className="border-b border-border/50 px-4 py-2.5 text-sm font-semibold">
                  {t('ordersManager.ecotrack.resultTitle')}
                </h3>
                <div className="divide-y divide-border/40">
                  {(Array.isArray(postingSummary.results) ? postingSummary.results : []).map(
                    (item) => (
                      <p key={`${item.reference}-${item.status}`} className="px-4 py-3 text-sm">
                        #{item.orderId} · {item.status}
                        {item.tracking ? ` · ${item.tracking}` : ''}
                        {item.message ? ` · ${item.message}` : ''}
                      </p>
                    ),
                  )}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
        <DialogFooter className="shrink-0 border-t border-border/60 px-4 py-3">
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
