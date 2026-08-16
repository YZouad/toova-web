import { describe, expect, it } from 'vitest';
import { productImagePublicUrl } from './dormChecklist';

// Mirror mapProduct field parsing without hitting Supabase.
function mapProductFields(row: Record<string, unknown>) {
  const bulletsRaw = row.feature_bullets;
  const featureBullets = Array.isArray(bulletsRaw)
    ? bulletsRaw
        .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
        .map((b) => b.trim())
    : [];
  const ratingRaw = row.rating;
  const rating =
    ratingRaw == null || ratingRaw === '' ? null : Number(ratingRaw);
  const reviewRaw = row.review_count;
  const reviewCount =
    reviewRaw == null || reviewRaw === ''
      ? null
      : Math.max(0, Math.floor(Number(reviewRaw)));
  return {
    brand:
      row.brand != null && String(row.brand).trim()
        ? String(row.brand).trim()
        : null,
    featureBullets,
    dimensionsText:
      row.dimensions_text != null && String(row.dimensions_text).trim()
        ? String(row.dimensions_text).trim()
        : null,
    rating: rating != null && Number.isFinite(rating) ? rating : null,
    reviewCount:
      reviewCount != null && Number.isFinite(reviewCount) ? reviewCount : null,
    availability:
      row.availability != null && String(row.availability).trim()
        ? String(row.availability).trim()
        : null,
    imageUrl: productImagePublicUrl(
      row.image_path != null && String(row.image_path).trim()
        ? String(row.image_path).trim()
        : null,
    ),
  };
}

describe('curated product detail mapping', () => {
  it('maps Amazon-like detail fields and omits empty values', () => {
    const mapped = mapProductFields({
      brand: ' Command ',
      feature_bullets: [' Damage-free ', '', 'Removes cleanly'],
      dimensions_text: ' Assorted pack ',
      rating: '4.6',
      review_count: '1280.7',
      availability: ' In stock ',
      image_path: null,
    });
    expect(mapped.brand).toBe('Command');
    expect(mapped.featureBullets).toEqual(['Damage-free', 'Removes cleanly']);
    expect(mapped.dimensionsText).toBe('Assorted pack');
    expect(mapped.rating).toBe(4.6);
    expect(mapped.reviewCount).toBe(1280);
    expect(mapped.availability).toBe('In stock');
    expect(mapped.imageUrl).toBeNull();
  });

  it('leaves ratings null when absent instead of inventing them', () => {
    const mapped = mapProductFields({
      brand: null,
      feature_bullets: null,
      dimensions_text: '',
      rating: null,
      review_count: null,
      availability: null,
    });
    expect(mapped.brand).toBeNull();
    expect(mapped.featureBullets).toEqual([]);
    expect(mapped.dimensionsText).toBeNull();
    expect(mapped.rating).toBeNull();
    expect(mapped.reviewCount).toBeNull();
    expect(mapped.availability).toBeNull();
  });
});
