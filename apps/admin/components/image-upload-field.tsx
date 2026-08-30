'use client';

/* eslint-disable @next/next/no-img-element -- Upload previews use transient blob URLs and must bypass the Next image optimizer. */

import { ImagePlus, LoaderCircle, Pencil, Trash2, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

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
};

type UploadItem = {
  id: string;
  fileName: string;
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
}: {
  file: File;
  uploadUrl: string;
  onProgress: (progress: number) => void;
}) {
  return new Promise<string[]>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);
    xhr.responseType = 'json';

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }

      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };

    xhr.onload = () => {
      const response = xhr.response as { urls?: string[]; error?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300 && response?.urls) {
        onProgress(100);
        resolve(response.urls);
        return;
      }

      reject(new Error(response?.error ?? 'Upload failed'));
    };

    xhr.onerror = () => {
      reject(new Error('Upload failed'));
    };

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
}: ImageUploadFieldProps) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pickerStateRef = useRef<PickerState>({ multiple, replaceIndex: null });
  const cleanupTimeoutRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const existingImages = useMemo(
    () => value.map((url, index) => ({ id: `${url}-${index}`, url, index })),
    [value],
  );

  useEffect(() => {
    return () => {
      mountedRef.current = false;

      if (cleanupTimeoutRef.current !== null) {
        window.clearTimeout(cleanupTimeoutRef.current);
      }
    };
  }, []);

  const openPicker = ({ multiple: allowMultiple, replaceIndex }: PickerState) => {
    pickerStateRef.current = { multiple: allowMultiple, replaceIndex };
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  };

  const applyUploadedUrls = (uploadedUrls: string[]) => {
    const { replaceIndex } = pickerStateRef.current;

    if (replaceIndex !== null) {
      const next = [...value];
      if (uploadedUrls[0]) {
        next[replaceIndex] = uploadedUrls[0];
      }
      onChange(next.filter(Boolean));
      return;
    }

    if (!multiple) {
      onChange(uploadedUrls[0] ? [uploadedUrls[0]] : value);
      return;
    }

    onChange([...new Set([...value, ...uploadedUrls])]);
  };

  const uploadImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const selectedFiles = Array.from(files);
    const effectiveFiles = pickerStateRef.current.multiple
      ? selectedFiles
      : selectedFiles.slice(0, 1);
    const nextUploads = effectiveFiles.map((file, index) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
      fileName: file.name,
      previewUrl: URL.createObjectURL(file),
      progress: 0,
      status: 'uploading' as const,
      file,
    }));

    setUploads((current) => [
      ...current,
      ...nextUploads.map((upload) => ({
        id: upload.id,
        fileName: upload.fileName,
        previewUrl: upload.previewUrl,
        progress: upload.progress,
        status: upload.status,
      })),
    ]);

    try {
      const uploadedUrls = await Promise.all(
        nextUploads.map(async ({ id, file }) => {
          try {
            const urls = await uploadSingleImage({
              file,
              uploadUrl,
              onProgress: (progress) => {
                setUploads((current) =>
                  current.map((upload) => (upload.id === id ? { ...upload, progress } : upload)),
                );
              },
            });
            setUploads((current) =>
              current.map((upload) =>
                upload.id === id ? { ...upload, progress: 100, status: 'success' } : upload,
              ),
            );
            return urls;
          } catch {
            setUploads((current) =>
              current.map((upload) => (upload.id === id ? { ...upload, status: 'error' } : upload)),
            );
            throw new Error('Upload failed');
          }
        }),
      );

      applyUploadedUrls(uploadedUrls.flat());
    } catch {
      // Preserve current value on failed uploads.
    } finally {
      if (cleanupTimeoutRef.current !== null) {
        window.clearTimeout(cleanupTimeoutRef.current);
      }

      cleanupTimeoutRef.current = window.setTimeout(() => {
        if (!mountedRef.current) {
          return;
        }

        setUploads((current) => {
          const retained = current.filter((upload) => upload.status === 'uploading');
          current
            .filter((upload) => upload.status !== 'uploading')
            .forEach((upload) => URL.revokeObjectURL(upload.previewUrl));
          return retained;
        });
      }, 900);
    }
  };

  const removeImage = (index: number) => {
    onChange(value.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragActive(false);
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
          className="sr-only"
          onChange={(event) => void uploadImages(event.target.files)}
        />

        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}

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
                    aria-label={`Open image ${image.index + 1}`}
                    className="block size-full cursor-pointer"
                    onClick={() =>
                      setPreviewImage({ src: image.url, alt: `Image ${image.index + 1}` })
                    }
                  >
                    <img src={image.url} alt="" className="size-full object-cover" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border/60 px-2.5 py-2">
                  <span className="truncate text-[length:var(--type-size-label-px)] font-medium text-muted-foreground">
                    Uploaded
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Change image ${image.index + 1}`}
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
                      aria-label={`Delete image ${image.index + 1}`}
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
                    aria-label={`Open upload preview ${upload.fileName}`}
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
                          ? 'Done'
                          : 'Failed'}
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
                      ? `${upload.progress}% uploaded`
                      : upload.status === 'success'
                        ? 'Uploaded'
                        : 'Upload failed'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <button
          type="button"
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
            {isDragActive ? 'Drop images to upload' : multiple ? 'Add images' : 'Choose image'}
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {multiple
              ? 'Drag and drop images here, or click to browse'
              : 'Drag and drop an image here, or click to browse'}
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
            <DialogTitle>Delete image?</DialogTitle>
            <DialogDescription>This image will be removed from the form.</DialogDescription>
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
                  removeImage(deleteIndex);
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
