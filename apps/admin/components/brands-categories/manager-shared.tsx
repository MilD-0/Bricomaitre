'use client';

import { useTranslations } from 'next-intl';

import type { QuerySnapshot } from '../../lib/query-cache';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

export type MutationMessages = { loading: string; success: string; error: string };
export type MutationContext<T> = {
  messages: MutationMessages;
  snapshot: QuerySnapshot<T>;
  toastId: string;
};

export function mutationErrorMessage(fallback: string, error: Error) {
  const detail = error.message.trim();
  return detail ? `${fallback} ${detail}` : fallback;
}

export function firstFormErrorMessage(errors: Record<string, unknown>): string | null {
  for (const value of Object.values(errors)) {
    if (
      value &&
      typeof value === 'object' &&
      'message' in value &&
      typeof value.message === 'string'
    ) {
      return value.message;
    }

    if (value && typeof value === 'object') {
      const nested: string | null = firstFormErrorMessage(value as Record<string, unknown>);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

export function actorLabel(name?: string | null, email?: string | null, fallback?: string) {
  return name ?? email ?? fallback ?? 'System';
}

export function timestampLabel(value: string, actor: string) {
  return `${new Date(value).toLocaleString()} • ${actor}`;
}

export function DeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  const t = useTranslations();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
            {t('actions.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function buildMessages(
  t: ReturnType<typeof useTranslations>,
  loadingKey: string,
  successKey: string,
  errorKey: string,
  values: Record<string, string | number>,
) {
  return {
    loading: t(loadingKey, values),
    success: t(successKey, values),
    error: t(errorKey, values),
  };
}
