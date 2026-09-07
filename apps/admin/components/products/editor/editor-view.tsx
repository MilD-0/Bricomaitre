'use client';
import { Trash2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { SidePanel } from '../../ui/side-panel';
import { Spinner } from '../../ui/spinner';
import { ProductForm } from './product-form';
import { productFormValues, type useProductEditorPanel } from './use-editor';

export function ProductEditorPanelView({
  state,
  pending,
  onClose,
  t,
  title,
  isEdit,
  confirmDelete,
  deleteMutation,
  setConfirmDelete,
  uploading,
  saveMutation,
  initialDetailLoading,
  submit,
  detailQuery,
  isDirty,
  currentUpdatedAt,
  sourceUpdatedAt,
  setSourceUpdatedAt,
  form,
  meta,
  active,
  inStock,
  promoFields,
  draftValues,
  storefrontBaseUrl,
  setUploading,
  images,
}: NonNullable<ReturnType<typeof useProductEditorPanel>['view']>) {
  return (
    <SidePanel
      open={state !== null}
      dismissible={!pending}
      onOpenChange={(open) => !open && onClose()}
      closeLabel={t('actions.cancel')}
      title={title}
      footer={
        <fieldset
          disabled={pending}
          aria-busy={pending}
          className="flex flex-wrap items-center gap-2"
        >
          {isEdit ? (
            confirmDelete ? (
              <div className="me-auto flex items-center gap-2 text-sm text-destructive">
                <span>{t('adminWorkspace.products.archiveConfirm')}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate()}
                >
                  {deleteMutation.isPending ? <Spinner className="size-3.5" /> : null}
                  {t('adminWorkspace.products.archive')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmDelete(false)}
                >
                  {t('actions.cancel')}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="me-auto text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                {t('adminWorkspace.products.archive')}
              </Button>
            )
          ) : (
            <span className="me-auto" />
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button
            type="button"
            disabled={uploading || saveMutation.isPending || (isEdit && initialDetailLoading)}
            onClick={() => void submit()}
          >
            {saveMutation.isPending ? <Spinner className="size-4" /> : null}
            {isEdit ? t('actions.saveProduct') : t('actions.createProduct')}
          </Button>
        </fieldset>
      }
    >
      {detailQuery.isFetching && isEdit ? (
        <div className="h-0.5 overflow-hidden bg-muted">
          <div className="h-full w-1/2 animate-pulse bg-primary" />
        </div>
      ) : null}
      {detailQuery.isError ? (
        <p className="border-b border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:px-6">
          {detailQuery.error.message}
        </p>
      ) : null}
      {isEdit && isDirty && currentUpdatedAt !== sourceUpdatedAt ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 border-b px-4 py-3 text-sm sm:px-6"
        >
          <p>{t('adminWorkspace.products.changedElsewhere')}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading || pending}
            onClick={() => {
              if (!detailQuery.data?.item) return;
              setSourceUpdatedAt(detailQuery.data.item.updatedAt);
              form.reset(productFormValues(detailQuery.data.item));
            }}
          >
            {t('adminWorkspace.products.loadLatest')}
          </Button>
        </div>
      ) : null}
      {isEdit && initialDetailLoading ? (
        <div className="grid min-h-[28rem] place-items-center px-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <Spinner className="size-4" />
            {t('labels.loading')}
          </span>
        </div>
      ) : (
        <ProductForm
          submit={submit}
          pending={pending}
          t={t}
          form={form}
          meta={meta}
          active={active}
          inStock={inStock}
          promoFields={promoFields}
          draftValues={draftValues}
          storefrontBaseUrl={storefrontBaseUrl}
          setUploading={setUploading}
          images={images}
        />
      )}
    </SidePanel>
  );
}
