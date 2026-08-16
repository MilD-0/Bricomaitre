const ASCII_REPLACEMENTS: Record<string, string> = {
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
  ø: 'o',
  đ: 'd',
  ħ: 'h',
  ı: 'i',
  ł: 'l',
  þ: 'th',
};

function transliterateToAscii(value: string) {
  return value.replace(/[æœßøđħıłþ]/g, (character) => ASCII_REPLACEMENTS[character] ?? character);
}

export function slugify(value: string) {
  const normalized = transliterateToAscii(value.normalize('NFKD').toLowerCase())
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'item';
}

export async function resolveUniqueSlug(
  value: string,
  isTaken: (slug: string) => Promise<boolean>,
) {
  const baseSlug = slugify(value);
  let candidate = baseSlug;
  let suffix = 2;

  while (await isTaken(candidate)) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export function createSlugAssigner(initialSlugs: Iterable<string> = []) {
  const reserved = new Set(
    Array.from(initialSlugs)
      .map((slug) => slug.trim().toLowerCase())
      .filter(Boolean),
  );

  return (value: string) => {
    const baseSlug = slugify(value);
    let candidate = baseSlug;
    let suffix = 2;

    while (reserved.has(candidate)) {
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    reserved.add(candidate);
    return candidate;
  };
}
