export function getDisplayImages(images: Array<string | null | undefined> | null | undefined) {
  return Array.isArray(images) ? images.filter((image): image is string => Boolean(image)) : [];
}
