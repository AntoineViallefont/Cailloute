import { describe, it, expect } from 'vitest';
import { isHelpfulReview } from './review-rewards';
describe('badge avis utile', () => {
 it('exige trois autres comptes distincts', () => {
  expect(isHelpfulReview({user_id:'a',voters:['a','b','b','c']})).toBe(false);
  expect(isHelpfulReview({user_id:'a',voters:['b','c','d']})).toBe(true);
 });
 it('retire le badge après retrait des votes ou absence de majorité', () => {
  expect(isHelpfulReview({user_id:'a',voters:['b','c']})).toBe(false);
  expect(isHelpfulReview({user_id:'a',voters:['b','c','d'],downvoters:['e','f','g']})).toBe(false);
 });
});
