'use client';
import { ImagePlus, LoaderCircle, Pencil, Trash2, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Field, FieldContent, FieldLabel } from '../ui/field';
import { type useImageUploadField } from './use-image-upload';

export function ImageUploadFieldView({
  label,
  inputRef,
  multiple,
  uploading,
  uploadImages,
  hint,
  batchError,
  existingImages,
  uploads,
  t,
  setPreviewImage,
  openPicker,
  setDeleteIndex,
  removeUpload,
  isDragActive,
  setIsDragActive,
  handleDrop,
  previewImage,
  deleteIndex,
  removeImage,
}: NonNullable<ReturnType<typeof useImageUploadField>['view']>) {
  return (
    <Field className="rounded-2xl border border-border/70 bg-background/60 p-3.5">
      <FieldLabel>{label}</FieldLabel>
      <FieldContent className="gap-3">
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept="image/*"
          disabled={uploading}
          className="sr-only"
          onChange={(event) => void uploadImages(event.target.files)}
        />

        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        {batchError ? (
          <p role="alert" className="text-sm text-destructive">
            {batchError}
          </p>
        ) : null}

        {existingImages.length > 0 || uploads.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {existingImages.map((image) => (
              <div
                key={image.id}
                className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm"
              >
                <div className="relative aspect-square bg-muted/30">
                  <button
                    type="button"
                    aria-label={t('openImage', { number: image.index + 1 })}
                    className="block size-full cursor-pointer"
                    onClick={() =>
                      setPreviewImage({
                        src: image.url,
                        alt: t('imageAlt', { number: image.index + 1 }),
                      })
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- Admin previews display uploaded or remote images directly. */}
                    <img src={image.url} alt="" className="size-full object-cover" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border/60 px-2.5 py-2">
                  <span className="truncate text-[length:var(--type-size-label-px)] font-medium text-muted-foreground">
                    {t('uploaded')}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={t('changeImage', { number: image.index + 1 })}
                      disabled={uploading}
                      className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        openPicker({ multiple: false, replaceIndex: image.index });
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('deleteImage', { number: image.index + 1 })}
                      disabled={uploading}
                      className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteIndex(image.index);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {uploads.map((upload) => (
              <div
                key={upload.id}
                className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm"
              >
                <div className="relative aspect-square bg-muted/30">
                  <button
                    type="button"
                    aria-label={t('openUploadPreview', { name: upload.fileName })}
                    className="block size-full cursor-pointer"
                    onClick={() =>
                      setPreviewImage({ src: upload.previewUrl, alt: upload.fileName })
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- Admin previews display uploaded or remote images directly. */}
                    <img
                      src={upload.previewUrl}
                      alt={upload.fileName}
                      className={`size-full object-cover transition-all duration-[var(--duration-standard)] ${upload.status === 'uploading' ? 'scale-[1.02] blur-sm brightness-75' : ''}`}
                    />
                  </button>
                  <div className="absolute inset-0 bg-[hsl(var(--foreground)/0.12)]" />
                  <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-[hsl(var(--background)/0.94)] via-[hsl(var(--background)/0.55)] to-transparent p-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-[hsl(var(--foreground)/0.12)]">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-[var(--duration-standard)]"
                        style={{ width: `${upload.progress}%` }}
                      />
                    </div>
                  </div>
                  <div className="absolute inset-x-0 top-3 flex justify-center">
                    <div className="rounded-full border border-border/20 bg-[hsl(var(--background)/0.84)] px-2.5 py-1 text-[length:var(--type-size-label-px)] font-medium text-foreground backdrop-blur-sm">
                      {upload.status === 'uploading'
                        ? `${upload.progress}%`
                        : upload.status === 'success'
                          ? t('done')
                          : t('failed')}
                    </div>
                  </div>
                  <div className="absolute right-2 top-2 rounded-full border border-border/20 bg-[hsl(var(--background)/0.84)] p-1.5 text-foreground backdrop-blur-sm">
                    {upload.status === 'uploading' ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : null}
                    {upload.status === 'error' ? <XCircle className="size-3.5" /> : null}
                    {upload.status === 'success' ? <ImagePlus className="size-3.5" /> : null}
                  </div>
                </div>
                <div className="space-y-1 border-t border-border/60 px-2.5 py-2">
                  <p className="truncate text-[length:var(--type-size-label-px)] font-medium">
                    {upload.fileName}
                  </p>
                  <p className="text-[length:var(--type-size-label-px)] text-muted-foreground">
                    {upload.status === 'uploading'
                      ? t('progress', { progress: upload.progress })
                      : upload.status === 'success'
                        ? t('uploaded')
                        : (upload.error ?? t('uploadFailed'))}
                  </p>
                  {upload.status === 'error' ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={uploading}
                        onClick={() => void uploadImages([upload.file], upload)}
                      >
                        {t('retry')}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={uploading}
                        onClick={() => removeUpload(upload)}
                      >
                        {t('delete')}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          disabled={uploading}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed px-4 py-4 text-center text-sm font-medium text-foreground transition-colors',
            isDragActive
              ? 'border-primary/80 bg-primary/10 text-primary'
              : 'border-border/80 bg-muted/30 hover:bg-muted/50',
          )}
          onClick={() => openPicker({ multiple, replaceIndex: null })}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (!isDragActive) {
              setIsDragActive(true);
            }
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
              return;
            }
            setIsDragActive(false);
          }}
          onDrop={handleDrop}
        >
          <ImagePlus className="size-4" />
          <span>
            {isDragActive ? t('dropImages') : multiple ? t('addImages') : t('chooseImage')}
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {multiple ? t('browseImages') : t('browseImage')}
          </span>
        </button>
      </FieldContent>

      <Dialog
        open={previewImage !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewImage(null);
        }}
      >
        <DialogContent className="max-w-5xl border-none bg-transparent p-0 shadow-none">
          {previewImage ? (
            <div className="overflow-hidden rounded-[var(--shape-radius-overlay-relaxed)] border border-border/15 bg-[hsl(var(--background)/0.86)] p-3 shadow-[var(--shadow-vapor-strong)] backdrop-blur-xl">
              {/* eslint-disable-next-line @next/next/no-img-element -- Admin previews display uploaded or remote images directly. */}
              <img
                src={previewImage.src}
                alt={previewImage.alt}
                className="max-h-[85vh] w-full rounded-[var(--shape-radius-panel)] object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteIndex !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteIndex(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteImageTitle')}</DialogTitle>
            <DialogDescription>{t('deleteImageDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteIndex(null)}>
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={uploading}
              onClick={() => {
                if (deleteIndex !== null) {
                  removeImage(deleteIndex);
                }
                setDeleteIndex(null);
              }}
            >
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Field>
  );
}
