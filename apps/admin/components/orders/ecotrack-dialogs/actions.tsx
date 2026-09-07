'use client';
import { Package, Send, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '../../ui/field';
import { Switch } from '../../ui/switch';
import { Textarea } from '../../ui/textarea';
import { type DeleteDialogState, type DispatchDialogState, type MajDialogState } from './contract';

type ActionDialogsProps = {
  deleteState: DeleteDialogState | null;
  dispatchState: DispatchDialogState | null;
  majState: MajDialogState | null;
  deleting: boolean;
  dispatching: boolean;
  postingUpdate: boolean;
  onDeleteClose: () => void;
  onDelete: (orderId: number) => void;
  onDispatchChange: (updater: (current: DispatchDialogState) => DispatchDialogState) => void;
  onDispatchClose: () => void;
  onDispatch: (state: DispatchDialogState) => void;
  onMajChange: (updater: (current: MajDialogState) => MajDialogState) => void;
  onMajClose: () => void;
  onMaj: (state: MajDialogState) => void;
};

export function EcotrackActionDialogs({
  deleteState,
  dispatchState,
  majState,
  deleting,
  dispatching,
  postingUpdate,
  onDeleteClose,
  onDelete,
  onDispatchChange,
  onDispatchClose,
  onDispatch,
  onMajChange,
  onMajClose,
  onMaj,
}: ActionDialogsProps) {
  const t = useTranslations();

  return (
    <>
      <Dialog open={deleteState !== null} onOpenChange={(open) => !open && onDeleteClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ordersEcotrackManager.dialogs.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('ordersEcotrackManager.dialogs.deleteDescription', {
                name: deleteState?.fullName ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onDeleteClose}>
              {t('actions.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteState && onDelete(deleteState.orderId)}
              disabled={deleting}
            >
              <Trash2 data-icon="inline-start" />
              {t('actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dispatchState !== null} onOpenChange={(open) => !open && onDispatchClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ordersEcotrackManager.dialogs.dispatchTitle')}</DialogTitle>
            <DialogDescription>
              {t('ordersEcotrackManager.dialogs.dispatchDescription', {
                name: dispatchState?.label ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field
              orientation="horizontal"
              className="justify-between rounded-[var(--shape-radius-card)] border border-border/70 bg-muted/10 p-3"
            >
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="ecotrack-ask-collection">
                  {t('ordersEcotrackManager.fields.askCollection')}
                </FieldLabel>
                <FieldDescription>
                  {t('ordersEcotrackManager.fields.askCollectionDescription')}
                </FieldDescription>
              </div>
              <Switch
                id="ecotrack-ask-collection"
                checked={dispatchState?.askCollection ?? false}
                onCheckedChange={(checked) =>
                  onDispatchChange((current) => ({ ...current, askCollection: checked }))
                }
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onDispatchClose}>
              {t('actions.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => dispatchState && onDispatch(dispatchState)}
              disabled={dispatching}
            >
              <Send data-icon="inline-start" />
              {t('ordersEcotrackManager.actions.dispatch')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={majState !== null} onOpenChange={(open) => !open && onMajClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ordersEcotrackManager.dialogs.majTitle')}</DialogTitle>
            <DialogDescription>
              {t('ordersEcotrackManager.dialogs.majDescription', {
                name: majState?.fullName ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="ecotrack-maj-content">
              {t('ordersEcotrackManager.fields.majContent')}
            </FieldLabel>
            <Textarea
              id="ecotrack-maj-content"
              maxLength={255}
              value={majState?.content ?? ''}
              onChange={(event) =>
                onMajChange((current) => ({ ...current, content: event.target.value }))
              }
            />
            <FieldDescription>{t('ordersEcotrackManager.fields.majHint')}</FieldDescription>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onMajClose}>
              {t('actions.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => majState && onMaj(majState)}
              disabled={postingUpdate || !majState?.content.trim()}
            >
              <Package data-icon="inline-start" />
              {t('ordersEcotrackManager.actions.maj')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
