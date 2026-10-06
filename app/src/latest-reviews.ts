import type { Detail, Review } from './types';

export function reviewDate(review: Review): string {
  const updated = Date.parse(review.updated || '');
  const created = Date.parse(review.created || '');
  return Number.isFinite(updated) && (!Number.isFinite(created) || updated >= created)
    ? review.updated : review.created;
}
export const reviewTime = (review: Review) => Date.parse(reviewDate(review)) || 0;
// L’identifiant privé temporaire désigne le même auteur que son avis publié.
export function latestReviews(reviews: Review[], actorId?: string): Review[] {
  const authors = new Map<string, Review>();
  for (const review of reviews) {
    const author = review.user_id === 'personal-device' && actorId ? actorId : review.user_id || `${review.place_id || ''}:${review.id}`;
    const previous = authors.get(author);
    if (!previous || reviewTime(review) > reviewTime(previous) || (reviewTime(review) === reviewTime(previous)
      && (review.user_id === 'personal-device' || previous.user_id !== 'personal-device')))
      authors.set(author, review);
  }
  return [...authors.values()];
}
export function uniqueReviewDetail<T extends Detail>(detail: T, actorId?: string): T {
  const reviews = latestReviews(detail.reviews, actorId);
  if (reviews.length === detail.reviews.length) return detail;
  return {...detail,reviews,review_count:reviews.length,
    rating:reviews.length ? reviews.reduce((sum,review)=>sum+review.stars,0)/reviews.length : null};
}
