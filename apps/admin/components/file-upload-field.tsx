'use client';

/* eslint-disable @next/next/no-img-element -- Upload previews use transient blob URLs and must bypass the Next image optimizer. */

import {
  Download,
  FileText,
  ImagePlus,
  LoaderCircle,
  Paperclip,
  Trash2,
  XCircle,
} from 'lucide-react';
import Uppy from '@uppy/core';
import XHRUpload from '@uppy/xhr-upload';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { BulletinAttachment } from '../lib/bulletin';
import {
  BULLETIN_UPLOAD_EXTENSIONS,
  MAX_BULLETIN_UPLOAD_BYTES,
  MAX_BULLETIN_UPLOAD_FILES,
  MAX_BULLETIN_UPLOAD_TOTAL_BYTES,
} from '../lib/upload-limits';
import { Button, buttonVariants } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Field, FieldContent, FieldLabel } from './ui/field';

type FileUploadFieldProps = {
  uploadUrl: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  value: BulletinAttachment[];
  onChange: (files: BulletinAttachment[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
};

type UploadState = {
  id: string;
  fileName: string;
  previewUrl: string | null;
  progress: number;
  status: 'uploading' | 'success' | 'error';
};

function isPreviewableImage(file: { contentType?: string | null; fileName?: string | null }) {
  return (
    file.contentType?.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|svg)$/i.test(file.fileName ?? '')
  );
}

function formatSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export function FileUploadField({
  uploadUrl,
  label,
  hint,
  disabled = false,
  value,
  onChange,
  onUploadingChange,
}: FileUploadFieldProps) {
  const t = useTranslations('uploadFields');
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [previewFile, setPreviewFile] = useState<{ src: string; alt: string } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uppyRef = useRef<Uppy<{ files: BulletinAttachment[] }, Record<string, never>> | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const onUploadingChangeRef = useRef(onUploadingChange);
  const uploadingRef = useRef(false);
  const [uploading, setUploading] = useState(false);

  const existingFiles = useMemo(
    () => value.map((file, index) => ({ ...file, index, id: `${file.fileUrl}-${index}` })),
    [value],
  );

  useEffect(() => {
    onChangeRef.current = onChange;
    valueRef.current = value;
    onUploadingChangeRef.current = onUploadingChange;
  }, [onChange, onUploadingChange, value]);

  useEffect(() => {
    const uppy = new Uppy<{ files: BulletinAttachment[] }, Record<string, never>>({
      autoProceed: false,
      restrictions: {
        maxFileSize: MAX_BULLETIN_UPLOAD_BYTES,
        maxTotalFileSize: MAX_BULLETIN_UPLOAD_TOTAL_BYTES,
        maxNumberOfFiles: MAX_BULLETIN_UPLOAD_FILES,
        allowedFileTypes: BULLETIN_UPLOAD_EXTENSIONS,
      },
    });

    uppy.use(XHRUpload, {
      endpoint: uploadUrl,
      fieldName: 'files',
      formData: true,
      limit: 2,
    });

    const previews = new Map<string, string>();
    const completionTimers = new Map<string, number>();
    const releasePreview = (id: string) => {
      const preview = previews.get(id);
      if (preview) URL.revokeObjectURL(preview);
      previews.delete(id);
      window.clearTimeout(completionTimers.get(id));
      completionTimers.delete(id);
    };

    uppy.on('file-added', (file) => {
      releasePreview(file.id);
      const previewUrl = file.type?.startsWith('image/')
        ? URL.createObjectURL(file.data as File)
        : null;
      if (previewUrl) previews.set(file.id, previewUrl);
      setUploads((current) => [
        ...current.filter((upload) => upload.id !== file.id),
        {
          id: file.id,
          fileName: file.name,
          previewUrl,
          progress: 0,
          status: 'uploading',
        },
      ]);
    });

    uppy.on('upload-progress', (file, progress) => {
      if (!file) {
        return;
      }

      const ratio = progress.bytesTotal
        ? Math.round((progress.bytesUploaded / progress.bytesTotal) * 100)
        : 0;
      setUploads((current) =>
        current.map((upload) => (upload.id === file.id ? { ...upload, progress: ratio } : upload)),
      );
    });

    uppy.on('upload-success', (file, response) => {
      if (!file) {
        return;
      }

      const body = response.body as { files?: BulletinAttachment[] } | undefined;
      const uploadedFiles = body?.files ?? [];
      const uploadedFile = uploadedFiles[0];

      if (!uploadedFile) {
        setUploads((current) =>
          current.map((upload) =>
            upload.id === file.id ? { ...upload, status: 'error' } : upload,
          ),
        );
        return;
      }

      setUploads((current) =>
        current.map((upload) =>
          upload.id === file.id ? { ...upload, progress: 100, status: 'success' } : upload,
        ),
      );
      const newFiles = uploadedFiles.filter(
        (uploaded) => !valueRef.current.some((existing) => existing.fileKey === uploaded.fileKey),
      );
      valueRef.current = [...valueRef.current, ...newFiles];
      onChangeRef.current(valueRef.current);
      completionTimers.set(
        file.id,
        window.setTimeout(() => {
          releasePreview(file.id);
          setUploads((current) => current.filter((upload) => upload.id !== file.id));
        }, 800),
      );
    });

    uppy.on('upload-error', (file) => {
      if (!file) {
        return;
      }

      setUploads((current) =>
        current.map((upload) => (upload.id === file.id ? { ...upload, status: 'error' } : upload)),
      );
    });

    uppyRef.current = uppy;

    return () => {
      for (const id of new Set([...previews.keys(), ...completionTimers.keys()]))
        releasePreview(id);
      setUploads([]);
      uploadingRef.current = false;
      setUploading(false);
      onUploadingChangeRef.current?.(false);
      uppy.destroy();
      uppyRef.current = null;
    };
  }, [uploadUrl]);

  const openPicker = () => {
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  };

  const addFiles = async (files: FileList | null) => {
    if (disabled || !files || files.length === 0 || !uppyRef.current || uploadingRef.current) {
      return;
    }

    const selected = Array.from(files);
    if (
      selected.length + valueRef.current.length > MAX_BULLETIN_UPLOAD_FILES ||
      selected.some((file) => file.size > MAX_BULLETIN_UPLOAD_BYTES) ||
      [...selected, ...valueRef.current].reduce((total, file) => total + file.size, 0) >
        MAX_BULLETIN_UPLOAD_TOTAL_BYTES
    ) {
      setError(t('attachmentLimit'));
      return;
    }
    setError(null);
    const uppy = uppyRef.current;
    uploadingRef.current = true;
    setUploading(true);
    onUploadingChangeRef.current?.(true);

    const mapped = Array.from(files).map((file) => ({
      name: file.name,
      type: file.type,
      data: file,
      source: 'local',
    }));

    mapped.forEach((file) => {
      try {
        uppy.addFile(file);
      } catch (error) {
        setError(error instanceof Error ? error.message : t('uploadFailed'));
      }
    });

    try {
      await uppy.upload();
    } catch (error) {
      setError(error instanceof Error ? error.message : t('uploadFailed'));
    } finally {
      if (uppyRef.current === uppy) {
        uppy.cancelAll();
        uploadingRef.current = false;
        setUploading(false);
        onUploadingChangeRef.current?.(false);
      }
    }
  };

  const removeFile = (index: number) => {
    valueRef.current = valueRef.current.filter((_, currentIndex) => currentIndex !== index);
    onChange(valueRef.current);
  };

  return (
    <Field className="rounded-2xl border border-border/70 bg-background/60 p-3.5">
      <FieldLabel>{label}</FieldLabel>
      <FieldContent className="gap-3">
        <input
          ref={inputRef}
          type="file"
          multiple
          disabled={disabled || uploading}
          accept={BULLETIN_UPLOAD_EXTENSIONS.join(',')}
          className="sr-only"
          onChange={(event) => void addFiles(event.target.files)}
        />

        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {existingFiles.length > 0 || uploads.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {existingFiles.map((file) => (
              <div
                key={file.id}
                className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm"
              >
                <div className="flex items-start gap-3 p-3">
                  {isPreviewableImage(file) ? (
                    <button
                      type="button"
                      aria-label={t('previewFile', { name: file.fileName })}
                      className="shrink-0"
                      onClick={() => setPreviewFile({ src: file.fileUrl, alt: file.fileName })}
                    >
                      <img
                        src={file.fileUrl}
                        alt={file.fileName}
                        className="size-16 rounded-xl object-cover"
                      />
                    </button>
                  ) : (
                    <div className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/30 text-muted-foreground">
                      <FileText />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium">{file.fileName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatSize(file.size)}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a
                        href={file.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonVariants({ variant: 'outline', size: 'sm' })}
                      >
                        <Download data-icon="inline-start" />
                        {t('download')}
                      </a>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={disabled || uploading}
                        onClick={() => setDeleteIndex(file.index)}
                      >
                        <Trash2 data-icon="inline-start" />
                        {t('delete')}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {uploads.map((upload) => (
              <div
                key={upload.id}
                className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm"
              >
                <div className="flex items-start gap-3 p-3">
                  {upload.previewUrl ? (
                    <img
                      src={upload.previewUrl}
                      alt={upload.fileName}
                      className="size-16 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/30 text-muted-foreground">
                      <Paperclip />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium">{upload.fileName}</p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-[width]"
                        style={{ width: `${upload.progress}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      {upload.status === 'uploading' ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : null}
                      {upload.status === 'error' ? (
                        <XCircle className="size-3.5 text-destructive" />
                      ) : null}
                      <span>
                        {upload.status === 'error'
                          ? t('uploadFailed')
                          : t('progress', { progress: upload.progress })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-border/80 bg-muted/30 px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
          disabled={disabled || uploading}
          onClick={openPicker}
        >
          <ImagePlus className="size-4" />
          <span>{t('addFiles')}</span>
        </button>
      </FieldContent>

      <Dialog
        open={previewFile !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewFile(null);
        }}
      >
        <DialogContent className="max-w-5xl border-none bg-transparent p-0 shadow-none">
          {previewFile ? (
            <div className="overflow-hidden rounded-[var(--shape-radius-overlay-relaxed)] border border-border/15 bg-[hsl(var(--background)/0.86)] p-3 shadow-[var(--shadow-vapor-strong)] backdrop-blur-xl">
              <img
                src={previewFile.src}
                alt={previewFile.alt}
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
            <DialogTitle>{t('deleteAttachmentTitle')}</DialogTitle>
            <DialogDescription>{t('deleteAttachmentDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteIndex(null)}>
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={disabled || uploading}
              onClick={() => {
                if (deleteIndex !== null) {
                  removeFile(deleteIndex);
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
