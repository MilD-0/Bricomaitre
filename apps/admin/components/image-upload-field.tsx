'use client';
import { ImageUploadFieldView } from './image-upload/image-upload-view';
import { useImageUploadField } from './image-upload/use-image-upload';
export function ImageUploadField(...args: Parameters<typeof useImageUploadField>) {
  const model = useImageUploadField(...args);
  if (model.view === null) return model.fallback;
  return <ImageUploadFieldView {...model.view} />;
}
