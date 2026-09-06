'use client';

/* eslint-disable @next/next/no-img-element -- Upload previews use transient blob URLs and must bypass the Next image optimizer. */

import { ImagePlus, LoaderCircle, Pencil, Trash2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  MAX_IMAGE_UPLOAD_FILES,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_IMAGE_UPLOAD_TOTAL_BYTES,
} from '../lib/upload-limits';
import { cn } from '../lib/utils';
import { Field, FieldContent, FieldLabel } from './ui/field';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';

type ImageUploadFieldProps = {
  uploadUrl: string;
  label: string;
  hint?: string;
  placeholder?: string;
  multiple?: boolean;
  value: string[];
  onChange: (urls: string[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
};

type UploadItem = {
  id: string;
  fileName: string;
  file: File;
  replaceUrl: string | null;
  error?: string;
  previewUrl: string;
  progress: number;
  status: 'uploading' | 'success' | 'error';
};

type PickerState = {
  multiple: boolean;
  replaceIndex: number | null;
};

function uploadSingleImage({
  file,
  uploadUrl,
  onProgress,
  signal,
  failureMessage,
}: {
  file: File;
  uploadUrl: string;
  onProgress: (progress: number) => void;
  signal: AbortSignal;
  failureMessage: string;
}) {
  return new Promise<string[]>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const fail = (error: Error) => {
      signal.removeEventListener('abort', abort);
      reject(error);
    };
    xhr.open('POST', uploadUrl);
    xhr.responseType = 'json';
    xhr.timeout = 60_000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      signal.removeEventListener('abort', abort);
      const response = xhr.response as { urls?: string[]; error?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300 && response?.urls?.length) {
        resolve(response.urls);
      } else {
        reject(new Error(response?.error ?? failureMessage));
      }
    };
    xhr.onerror = () => fail(new Error(failureMessage));
    xhr.ontimeout = () => fail(new Error(failureMessage));
    xhr.onabort = () => fail(new DOMException('Upload cancelled', 'AbortError'));
    if (signal.aborted) {
      fail(new DOMException('Upload cancelled', 'AbortError'));
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    const body = new FormData();
    body.append('files', file);
    xhr.send(body);
  });
}

export function ImageUploadField({
  uploadUrl,
  label,
  hint,
  multiple = false,
  value,
  onChange,
  onUploadingChange,
}: ImageUploadFieldProps) {
  const t = useTranslations('uploadFields');
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pickerStateRef = useRef<PickerState>({ multiple, replaceIndex: null });
  const previewUrlsRef = useRef(new Set<string>());
  const uploadAbortRef = useRef<AbortController | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const uploadingRef = useRef(false);
  const uploading = uploads.some((upload) => upload.status === 'uploading');
  const existingImages = useMemo(
    () => value.map((url, index) => ({ id: `${url}-${index}`, url, index })),
    [value],
  );

  useEffect(() => {
    mountedRef.current = true;
    const previewUrls = previewUrlsRef.current;
    return () => {
      mountedRef.current = false;

      uploadAbortRef.current?.abort();
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.clear();
    };
  }, []);

  const openPicker = ({ multiple: allowMultiple, replaceIndex }: PickerState) => {
    if (uploadingRef.current) return;
    pickerStateRef.current = { multiple: allowMultiple, replaceIndex };
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  };

  const removeUpload = (upload: UploadItem) => {
    URL.revokeObjectURL(upload.previewUrl);
    previewUrlsRef.current.delete(upload.previewUrl);
    setUploads((current) => current.filter((item) => item.id !== upload.id));
  };

  const uploadImages = async (files: FileList | File[] | null, retry?: UploadItem) => {
    if (!files?.length || uploadingRef.current) return;
    const selectedFiles = Array.from(files);
    const effectiveFiles = pickerStateRef.current.multiple
      ? selectedFiles
      : selectedFiles.slice(0, 1);
    if (
      effectiveFiles.length > MAX_IMAGE_UPLOAD_FILES ||
      effectiveFiles.some((file) => file.size > MAX_IMAGE_UPLOAD_BYTES) ||
      effectiveFiles.reduce((total, file) => total + file.size, 0) > MAX_IMAGE_UPLOAD_TOTAL_BYTES
    ) {
      setBatchError(t('batchLimit'));
      return;
    }
    setBatchError(null);
    uploadingRef.current = true;
    onUploadingChange?.(true);
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    const replaceUrl = retry
      ? retry.replaceUrl
      : (value[pickerStateRef.current.replaceIndex ?? -1] ?? null);
    const nextUploads: UploadItem[] = retry
      ? [{ ...retry, progress: 0, status: 'uploading', error: undefined }]
      : effectiveFiles.map((file) => {
          const previewUrl = URL.createObjectURL(file);
          previewUrlsRef.current.add(previewUrl);
          return {
            id: crypto.randomUUID(),
            fileName: file.name,
            file,
            replaceUrl,
            previewUrl,
            progress: 0,
            status: 'uploading',
          };
        });
    setUploads((current) => [...current.filter((item) => item.id !== retry?.id), ...nextUploads]);
    const uploadedUrls: string[] = [];
    try {
      for (let offset = 0; offset < nextUploads.length && !controller.signal.aborted; offset += 3) {
        const results = await Promise.all(
          nextUploads.slice(offset, offset + 3).map(async (item) => {
            try {
              const urls = await uploadSingleImage({
                file: item.file,
                uploadUrl,
                signal: controller.signal,
                failureMessage: t('uploadFailed'),
                onProgress: (progress) => {
                  if (mountedRef.current)
                    setUploads((current) =>
                      current.map((upload) =>
                        upload.id === item.id ? { ...upload, progress } : upload,
                      ),
                    );
                },
              });
              if (mountedRef.current)
                setUploads((current) =>
                  current.map((upload) =>
                    upload.id === item.id
                      ? { ...upload, progress: 100, status: 'success' }
                      : upload,
                  ),
                );
              return urls;
            } catch (error) {
              if (mountedRef.current)
                setUploads((current) =>
                  current.map((upload) =>
                    upload.id === item.id
                      ? {
                          ...upload,
                          status: 'error',
                          error: error instanceof Error ? error.message : t('uploadFailed'),
                        }
                      : upload,
                  ),
                );
              return [];
            }
          }),
        );
        uploadedUrls.push(...results.flat());
      }
      if (mountedRef.current && uploadedUrls.length) {
        const replaceIndex = replaceUrl ? value.indexOf(replaceUrl) : -1;
        if (replaceIndex !== -1) {
          const next = [...value];
          next[replaceIndex] = uploadedUrls[0]!;
          onChange(next);
        } else {
          onChange(multiple ? [...new Set([...value, ...uploadedUrls])] : [uploadedUrls[0]!]);
        }
      }
    } finally {
      uploadingRef.current = false;
      uploadAbortRef.current = null;
      if (mountedRef.current) {
        onUploadingChange?.(false);
        setUploads((current) => {
          for (const item of current.filter((upload) => upload.status === 'success')) {
            URL.revokeObjectURL(item.previewUrl);
            previewUrlsRef.current.delete(item.previewUrl);
          }
          return current.filter((upload) => upload.status !== 'success');
        });
      }
    }
  };

  const removeImage = (index: number) => {
    if (uploadingRef.current) return;
    onChange(value.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    if (uploadingRef.current) return;
    pickerStateRef.current = { multiple, replaceIndex: null };
    void uploadImages(event.dataTransfer.files);
  };

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
