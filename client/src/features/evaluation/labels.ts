import type {
  FinanceType,
  Review,
  ReviewRecommendation,
  ReviewScores,
} from "@shared/contracts";

export const financeTypeLabels: Record<FinanceType, string> = {
  grant: "Grant",
  subsidy: "Subsidy",
  equity: "Equity",
  loan: "Loan",
  pre_sale: "Pre-sale",
  deferral: "Deferral",
};

export const recommendationLabels: Record<ReviewRecommendation, string> = {
  pass: "Pass",
  consider: "Consider",
  develop: "Develop",
};

/** Mirrors the server rule so the form can preview a verdict before saving. */
export function recommendationFor(scores: ReviewScores): ReviewRecommendation {
  const mean =
    (scores.script + scores.director + scores.cast + scores.financing) / 4;
  if (mean >= 8) return "develop";
  if (mean >= 5) return "consider";
  return "pass";
}

export const meanScore = (scores: ReviewScores): number =>
  (scores.script + scores.director + scores.cast + scores.financing) / 4;

export interface ScoreAverages extends ReviewScores {
  overall: number;
  count: number;
}

/** Team averages per criterion; zeros when nobody has reviewed. */
export function averageScores(reviews: Review[]): ScoreAverages {
  const count = reviews.length;
  const average = (pick: (scores: ReviewScores) => number) =>
    count === 0
      ? 0
      : reviews.reduce((sum, review) => sum + pick(review.scores), 0) / count;
  const script = average((s) => s.script);
  const director = average((s) => s.director);
  const cast = average((s) => s.cast);
  const financing = average((s) => s.financing);
  return {
    script,
    director,
    cast,
    financing,
    overall: (script + director + cast + financing) / 4,
    count,
  };
}
