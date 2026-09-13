import type { ReviewRecommendation, ReviewScores } from "@shared/contracts";

/**
 * The product rule the prototype applied on the client: a reviewer's verdict
 * follows from the mean of the four scores. Kept server-side so every stored
 * review carries a consistent recommendation.
 */
export function recommendationFor(scores: ReviewScores): ReviewRecommendation {
  const mean =
    (scores.script + scores.director + scores.cast + scores.financing) / 4;
  if (mean >= 8) return "develop";
  if (mean >= 5) return "consider";
  return "pass";
}
