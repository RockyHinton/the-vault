import {
  developmentBlockers,
  productionBlockers,
  type ProjectStage,
  type StageBlocker,
} from "@shared/contracts";
import type { EvaluationService } from "../evaluation/evaluation-service";
import type { FinancingOverviewService } from "../financing-overview/financing-overview-service";
import type { LegalRecordService } from "../legal/legal-record-service";
import type { PersonService } from "../people/person-service";

/**
 * Stage readiness is a read model, like the Financing Overview: it owns no
 * table and composes the owning domains' services, so every input is the
 * same authoritative contract those domains serve (the evaluation's gates,
 * the locked budget and derived financing, legal records with their current
 * document statuses, creatives). The rule itself is `developmentBlockers` /
 * `productionBlockers`; the Projects transition command asks this service at
 * command time and refuses while anything blocks.
 */
export function createStageReadinessService(deps: {
  evaluationService: EvaluationService;
  financingOverviewService: FinancingOverviewService;
  legalRecordService: LegalRecordService;
  personService: PersonService;
}) {
  return {
    async blockersFor(
      projectId: string,
      toStage: ProjectStage,
    ): Promise<StageBlocker[]> {
      if (toStage === "development")
        return developmentBlockers(
          (await deps.evaluationService.getEvaluation(projectId)).gates,
        );
      if (toStage === "production") {
        const [financing, legalRecords, creatives] = await Promise.all([
          deps.financingOverviewService.get(projectId),
          deps.legalRecordService.list(projectId, {}),
          deps.personService.list(projectId, { kind: "creative" }),
        ]);
        return productionBlockers({ financing, legalRecords, creatives });
      }
      return [];
    },
  };
}

export type StageReadinessService = ReturnType<
  typeof createStageReadinessService
>;
