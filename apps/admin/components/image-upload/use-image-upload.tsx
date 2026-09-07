'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_IMAGE_UPLOAD_FILES,
  MAX_IMAGE_UPLOAD_TOTAL_BYTES,
} from '../../lib/upload-limits';

type ImageUploadFieldProps = {
  uploadUrl: string;
  label: string;
  hint?: string;
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

export function useImageUploadField({
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

  return {
    view: {
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
    } as const,
    fallback: null,
  };
}
