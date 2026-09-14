import type {
  Document,
  DocumentFolder,
  DocumentStatus,
} from "@shared/contracts";
import { toFileObjectContract } from "../files/file-service";
import { toUserRef } from "../users/user-ref";
import type { DocumentRecord } from "./document-repository";

/**
 * The one `Document` contract mapper: a pure function from the repository's
 * record to the API shape. It lives below the Documents service so that the
 * service, the shared attachment repository and owning domains (Scripts,
 * every document owner) all depend on it without depending on the service.
 */
export function toDocumentContract(record: DocumentRecord): Document {
  const { document, file, createdBy } = record;
  return {
    id: document.id,
    projectId: document.projectId,
    lineageId: document.lineageId,
    versionNumber: document.versionNumber,
    isCurrent: document.isCurrent,
    folder: document.folder as DocumentFolder,
    title: document.title,
    status: document.status as DocumentStatus,
    notes: document.notes,
    file: toFileObjectContract(file),
    createdBy: toUserRef(createdBy),
    version: document.version,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}
