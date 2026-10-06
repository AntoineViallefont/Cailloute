import type { Review } from './types';
/** Un compte compte une seule fois ; aucune récompense liée au volume publié. */
export function isHelpfulReview(review: Pick<Review, 'user_id' | 'voters' | 'downvoters'>) {
  const positive = new Set((review.voters || []).filter(id => id !== review.user_id));
  const negative = new Set((review.downvoters || []).filter(id => id !== review.user_id));
  return positive.size >= 3 && positive.size > negative.size;
}
