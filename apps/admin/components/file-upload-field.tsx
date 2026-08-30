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
import { useEffect, useMemo, useRef, useState } from 'react';

import type { BulletinAttachment } from '../lib/bulletin';
import {
  BULLETIN_UPLOAD_EXTENSIONS,
  MAX_BULLETIN_UPLOAD_BYTES,
  MAX_BULLETIN_UPLOAD_FILES,
  MAX_BULLETIN_UPLOAD_TOTAL_BYTES,
} from '../lib/upload-limits';
import { Button } from './ui/button';
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
  value: BulletinAttachment[];
  onChange: (files: BulletinAttachment[]) => void;
  onUploadStart?: () => void;
  onUploaded?: (payload: { file: BulletinAttachment; body: unknown }) => void;
  extraFields?: Record<string, string>;
  bundleUploads?: boolean;
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  maxTotalFileSize?: number;
  allowedFileTypes?: string[];
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
  value,
  onChange,
  onUploadStart,
  onUploaded,
  extraFields,
  bundleUploads = false,
  maxNumberOfFiles = MAX_BULLETIN_UPLOAD_FILES,
  maxFileSize = MAX_BULLETIN_UPLOAD_BYTES,
  maxTotalFileSize = MAX_BULLETIN_UPLOAD_TOTAL_BYTES,
  allowedFileTypes = BULLETIN_UPLOAD_EXTENSIONS,
}: FileUploadFieldProps) {
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [previewFile, setPreviewFile] = useState<{ src: string; alt: string } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uppyRef = useRef<Uppy<{ files: BulletinAttachment[] }, Record<string, never>> | null>(null);
  const onChangeRef = useRef(onChange);
  const onUploadedRef = useRef(onUploaded);
  const valueRef = useRef(value);

  const existingFiles = useMemo(
    () => value.map((file, index) => ({ ...file, index, id: `${file.fileUrl}-${index}` })),
    [value],
  );

  useEffect(() => {
    onChangeRef.current = onChange;
    onUploadedRef.current = onUploaded;
    valueRef.current = value;
  }, [onChange, onUploaded, value]);

  useEffect(() => {
    const uppy = new Uppy<{ files: BulletinAttachment[] }, Record<string, never>>({
      autoProceed: false,
      restrictions: {
        maxFileSize,
        maxTotalFileSize,
        maxNumberOfFiles,
        allowedFileTypes,
      },
    });

    uppy.use(XHRUpload, {
      endpoint: uploadUrl,
      fieldName: 'files',
      formData: true,
      bundle: bundleUploads,
      limit: 2,
      headers: {},
    });

    if (extraFields) {
      uppy.setMeta(extraFields);
    }

    uppy.on('file-added', (file) => {
      setUploads((current) => [
        ...current,
        {
          id: file.id,
          fileName: file.name,
          previewUrl: file.type?.startsWith('image/')
            ? URL.createObjectURL(file.data as File)
            : null,
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
      const uploadedIds = bundleUploads
        ? Array.from(uppy.getFiles()).map((uppyFile) => uppyFile.id)
        : [file.id];

      if (!uploadedFile) {
        setUploads((current) =>
          current.map((upload) =>
            uploadedIds.includes(upload.id) ? { ...upload, status: 'error' } : upload,
          ),
        );
        return;
      }

      setUploads((current) =>
        current.map((upload) =>
          uploadedIds.includes(upload.id)
            ? { ...upload, progress: 100, status: 'success' }
            : upload,
        ),
      );
      onChangeRef.current([...valueRef.current, ...uploadedFiles]);
      onUploadedRef.current?.({ file: uploadedFile, body });
      window.setTimeout(() => {
        setUploads((current) => {
          const next = current.filter((upload) => !uploadedIds.includes(upload.id));
          current
            .filter((upload) => uploadedIds.includes(upload.id))
            .forEach((removed) => {
              if (removed.previewUrl) {
                URL.revokeObjectURL(removed.previewUrl);
              }
            });
          return next;
        });
      }, 800);
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
      setUploads((current) => {
        current.forEach((upload) => {
          if (upload.previewUrl) {
            URL.revokeObjectURL(upload.previewUrl);
          }
        });
        return [];
      });
      uppy.destroy();
      uppyRef.current = null;
    };
  }, [
    allowedFileTypes,
    bundleUploads,
    extraFields,
    maxFileSize,
    maxNumberOfFiles,
    maxTotalFileSize,
    uploadUrl,
  ]);

  const openPicker = () => {
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  };

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !uppyRef.current) {
      return;
    }

    onUploadStart?.();

    const mapped = Array.from(files).map((file) => ({
      name: file.name,
      type: file.type,
      data: file,
      source: 'local',
    }));

    mapped.forEach((file) => {
      try {
        uppyRef.current?.addFile(file);
      } catch {
        // Preserve current state if Uppy rejects a file.
      }
    });

    await uppyRef.current.upload();
    uppyRef.current.cancelAll();
  };

  const removeFile = (index: number) => {
    onChange(value.filter((_, currentIndex) => currentIndex !== index));
  };

  return (
    <Field className="rounded-2xl border border-border/70 bg-background/60 p-3.5">
      <FieldLabel>{label}</FieldLabel>
      <FieldContent className="gap-3">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={allowedFileTypes.join(',')}
          className="sr-only"
          onChange={(event) => void addFiles(event.target.files)}
        />

        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}

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
                      aria-label={`Preview ${file.fileName}`}
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
                        className="inline-flex"
                      >
                        <Button type="button" variant="outline" size="sm">
                          <Download data-icon="inline-start" />
                          Download
                        </Button>
                      </a>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteIndex(file.index)}
                      >
                        <Trash2 data-icon="inline-start" />
                        Delete
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
                          ? 'Upload failed'
                          : `${upload.progress}% uploaded`}
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
          onClick={openPicker}
        >
          <ImagePlus className="size-4" />
          <span>Add files</span>
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
            <DialogTitle>Delete attachment?</DialogTitle>
            <DialogDescription>This file will be removed from the draft.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteIndex(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (deleteIndex !== null) {
                  removeFile(deleteIndex);
                }
                setDeleteIndex(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Field>
  );
}
