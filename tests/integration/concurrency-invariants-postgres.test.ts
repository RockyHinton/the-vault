import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import type { Response } from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  budgetDepartmentDocuments,
  distributionTerritoryDocuments,
  financeSourceDocuments,
  legalRecordDocuments,
  projectPersonDocuments,
  projectRightDocuments,
} from "@shared/schema";
import type { FileStorage } from "../../server/files/file-storage";
import { withTransaction } from "../../server/db/transaction";
import { attachmentPrimaryKeyName } from "../../server/modules/documents/document-attachments";
import { createDocumentInTransaction } from "../../server/modules/documents/document-service";
import { createFileService } from "../../server/modules/files/file-service";
import { personDocumentRepository } from "../../server/modules/people/person-repository";
import { openClient, waitForLockWaiters } from "../support/lock-waiters";
import {
  adminCredentials,
  createTestContext,
  memberCredentials,
  type TestContext,
  type TestCredentials,
} from "../support/test-context";

/**
 * Invariants that only fail under real concurrency. Each race is made
 * deterministic with a barrier: a second connection holds a row lock (or an
 * uncommitted row) that every racing command must wait on, the test waits
 * until `pg_stat_activity` shows all of them blocked inside their
 * transactions, and only then releases the barrier.
 */

type Agent = Awaited<ReturnType<TestContext["loginAs"]>>;

let context: TestContext;
let admin: Agent;
let member: Agent;
let projectId: string;
/** Holds the barrier lock. */
let barrier: Client;
/** Watches for lock waiters from outside any transaction. */
let watcher: Client;

const rows = async <T>(sql: string, params: unknown[] = []) =>
  (await context.database.client.query(sql, params)).rows as T[];
const count = async (sql: string, params: unknown[] = []) =>
  (await rows<{ n: number }>(sql, params))[0].n;
const statuses = (responses: Response[]) =>
  responses.map((r) => r.status).sort((a, b) => a - b);
const send = <T extends PromiseLike<Response>>(pending: T) =>
  Promise.resolve(pending);

const stagePdf = async (agent: Agent, name: string) => {
  const response = await agent
    .post("/api/v1/files")
    .set("content-type", "application/octet-stream")
    .set("x-vault-filename", name)
    .send(Buffer.from(`%PDF-1.4\n% ${name} ${randomUUID()}\n%%EOF\n`));
  expect(response.status).toBe(201);
  return response.body.data.id as string;
};

beforeAll(async () => {
  context = await createTestContext();
  admin = await context.loginAs(adminCredentials);
  member = await context.loginAs(memberCredentials);
  projectId = (await admin.post("/api/v1/projects").send({ title: "Races" }))
    .body.data.id;
  barrier = await openClient(context.database.databaseUrl);
  watcher = await openClient(context.database.databaseUrl);
});

afterAll(async () => {
  await barrier?.end();
  await watcher?.end();
  await context?.destroy();
});

describe("document attachment: concurrent duplicate attach", () => {
  const people = () => `/api/v1/projects/${projectId}/people`;
  let personId: string;

  it("one attach wins and the other gets DOCUMENT_ALREADY_ATTACHED, never a 500; one link, one audit event", async () => {
    const person = await member.post(people()).send({
      kind: "producer",
      name: "Race Producer",
      roleTitle: "Producer",
      company: "Parallel Pictures",
      contacts: [],
      links: [],
      status: "interested",
      engagement: {},
    });
    expect(person.status).toBe(201);
    personId = person.body.data.id;
    const document = await member
      .post(`/api/v1/projects/${projectId}/documents`)
      .send({
        fileObjectId: await stagePdf(member, "Bio.pdf"),
        folder: "producers",
        title: "Bio",
      });
    expect(document.status).toBe(201);
    const lineageId = document.body.data.lineageId as string;
    const url = `${people()}/${personId}/documents/${document.body.data.id}`;

    // Barrier: an uncommitted link on the same (person, lineage) key. Both
    // commands pass the service pre-check (they cannot see it) and then
    // block on the primary key inside their own transactions.
    await barrier.query("BEGIN");
    await barrier.query(
      "INSERT INTO project_person_documents (person_id, document_lineage_id, attached_by_user_id) VALUES ($1, $2, $3)",
      [personId, lineageId, context.seeded.adminUserId],
    );
    const racing = [send(member.put(url)), send(admin.put(url))];
    await waitForLockWaiters(watcher, 2);
    await barrier.query("ROLLBACK");
    const results = await Promise.all(racing);

    expect(statuses(results)).toEqual([200, 409]);
    const loser = results.find((r) => r.status === 409);
    expect(loser?.body.error.code).toBe("DOCUMENT_ALREADY_ATTACHED");
    expect(loser?.body.error.requestId).toEqual(expect.any(String));
    expect(
      await count(
        "SELECT count(*)::int AS n FROM project_person_documents WHERE person_id = $1",
        [personId],
      ),
    ).toBe(1);
    expect(
      await count(
        "SELECT count(*)::int AS n FROM audit_events WHERE action = 'person.document_attached' AND entity_id = $1",
        [personId],
      ),
    ).toBe(1);
  });

  it("the conflict mapping names each owner table's real primary key", async () => {
    for (const table of [
      projectPersonDocuments,
      projectRightDocuments,
      legalRecordDocuments,
      budgetDepartmentDocuments,
      financeSourceDocuments,
      distributionTerritoryDocuments,
    ]) {
      const name = attachmentPrimaryKeyName(table);
      expect(
        await count(
          "SELECT count(*)::int AS n FROM pg_constraint WHERE conname = $1 AND contype = 'p'",
          [name],
        ),
        name,
      ).toBe(1);
    }
  });

  it("any other database error on insert propagates untouched (not a 409)", async () => {
    await expect(
      withTransaction(context.db, (tx) =>
        personDocumentRepository.insert(tx, {
          ownerId: personId,
          documentLineageId: randomUUID(),
          attachedByUserId: context.seeded.adminUserId,
        }),
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });
});

describe("users: the last active studio_admin under concurrent removal", () => {
  const activeAdmins = () =>
    count(
      "SELECT count(*)::int AS n FROM application_users WHERE role = 'studio_admin' AND status = 'active'",
    );
  const versionOf = async (id: string) =>
    (
      await rows<{ version: number }>(
        "SELECT version FROM application_users WHERE id = $1",
        [id],
      )
    )[0].version;
  const auditCount = (action: string, entityId: string) =>
    count(
      "SELECT count(*)::int AS n FROM audit_events WHERE action = $1 AND entity_id = $2",
      [action, entityId],
    );
  /** Holds both users' rows so both commands are in flight before either may proceed. */
  const holdUsers = async (ids: string[]) => {
    await barrier.query("BEGIN");
    await barrier.query(
      "SELECT id FROM application_users WHERE id = ANY($1) ORDER BY id FOR UPDATE",
      [ids],
    );
  };
  const provisionAdmin = async (by: Agent, credentials: TestCredentials) => {
    const created = await by
      .post("/api/v1/users")
      .send({ ...credentials, role: "studio_admin" });
    expect(created.status).toBe(201);
    return {
      id: created.body.data.id as string,
      agent: await context.loginAs(credentials),
    };
  };

  let survivor: { id: string; agent: Agent };

  it("two admins demoting each other at once: one succeeds, the other is LAST_ADMIN_PROTECTED", async () => {
    const first = { id: context.seeded.adminUserId, agent: admin };
    const second = await provisionAdmin(admin, {
      email: "second.admin@vault.test",
      password: "Second-Admin-Password-2026",
      displayName: "Second Admin",
    });
    expect(await activeAdmins()).toBe(2);
    const firstVersion = await versionOf(first.id);
    const secondVersion = await versionOf(second.id);

    await holdUsers([first.id, second.id]);
    const racing = [
      send(
        first.agent
          .post(`/api/v1/users/${second.id}/role`)
          .send({ role: "user", version: secondVersion }),
      ),
      send(
        second.agent
          .post(`/api/v1/users/${first.id}/role`)
          .send({ role: "user", version: firstVersion }),
      ),
    ];
    await waitForLockWaiters(watcher, 2);
    await barrier.query("ROLLBACK");
    const results = await Promise.all(racing);

    expect(statuses(results)).toEqual([200, 409]);
    const refused = results.find((r) => r.status === 409);
    expect(refused?.body.error.code).toBe("LAST_ADMIN_PROTECTED");
    expect(await activeAdmins()).toBe(1);
    survivor = results[0].status === 200 ? first : second;
    const demoted = survivor === first ? second : first;
    expect(await auditCount("user.role_changed", demoted.id)).toBe(1);
    expect(await auditCount("user.role_changed", survivor.id)).toBe(0);
    expect(await versionOf(survivor.id)).toBe(
      survivor === first ? firstVersion : secondVersion,
    );
  });

  it("a suspension racing a demotion: never zero admins; only the winner's state, sessions and audit change", async () => {
    const third = await provisionAdmin(survivor.agent, {
      email: "third.admin@vault.test",
      password: "Third-Admin-Password-2026",
      displayName: "Third Admin",
    });
    expect(await activeAdmins()).toBe(2);
    const survivorVersion = await versionOf(survivor.id);
    const thirdVersion = await versionOf(third.id);

    await holdUsers([survivor.id, third.id]);
    const suspend = send(
      survivor.agent
        .post(`/api/v1/users/${third.id}/suspend`)
        .send({ version: thirdVersion }),
    );
    const demote = send(
      third.agent
        .post(`/api/v1/users/${survivor.id}/role`)
        .send({ role: "user", version: survivorVersion }),
    );
    await waitForLockWaiters(watcher, 2);
    await barrier.query("ROLLBACK");
    const [suspended, demoted] = await Promise.all([suspend, demote]);

    expect(statuses([suspended, demoted])).toEqual([200, 409]);
    const refused = suspended.status === 409 ? suspended : demoted;
    expect(refused.body.error.code).toBe("LAST_ADMIN_PROTECTED");
    expect(await activeAdmins()).toBe(1);
    const liveSessions = await count(
      "SELECT count(*)::int AS n FROM auth_sessions WHERE user_id = $1 AND revoked_at IS NULL",
      [third.id],
    );
    if (suspended.status === 200) {
      expect(liveSessions).toBe(0);
      expect(await auditCount("user.suspended", third.id)).toBe(1);
      expect(await auditCount("user.role_changed", survivor.id)).toBe(0);
      expect(await versionOf(survivor.id)).toBe(survivorVersion);
    } else {
      expect(liveSessions).toBeGreaterThan(0);
      expect(await auditCount("user.suspended", third.id)).toBe(0);
      expect(await auditCount("user.role_changed", survivor.id)).toBe(1);
      expect(await versionOf(third.id)).toBe(thirdVersion);
    }
  });
});

describe("files: the staged-upload sweep racing a document claim", () => {
  const sweeper = (storage: FileStorage = context.storage.storage) =>
    createFileService({
      db: context.db,
      storage,
      maxUploadBytes: 1024 * 1024,
    });
  const ageStaged = (ids: string[]) =>
    rows(
      "UPDATE file_objects SET created_at = now() - interval '2 days' WHERE id = ANY($1)",
      [ids],
    );
  const fileRow = async (id: string) =>
    (
      await rows<{ status: string; storage_key: string }>(
        "SELECT status, storage_key FROM file_objects WHERE id = $1",
        [id],
      )
    )[0];

  it("a file claimed while the sweep runs keeps its bytes and stays available", async () => {
    const fileId = await stagePdf(member, "Claimed.pdf");
    await ageStaged([fileId]);

    let sweep: Promise<number> | undefined;
    const document = await withTransaction(context.db, async (tx) => {
      const created = await createDocumentInTransaction(tx, {
        projectId,
        document: {
          fileObjectId: fileId,
          folder: "general",
          title: "Claimed",
          status: "draft",
        },
        actor: {
          userId: context.seeded.memberUserId,
          role: "user",
          requestId: randomUUID(),
        },
      });
      // The claim is written but not committed. The sweep still lists the
      // file as staged and must now wait on this transaction's outcome.
      sweep = sweeper().sweepStagedUploads();
      await waitForLockWaiters(watcher, 1);
      return created;
    });
    await sweep;

    const row = await fileRow(fileId);
    expect(row.status).toBe("available");
    expect(await context.storage.storage.exists(row.storage_key)).toBe(true);
    expect((await member.get(`/api/v1/files/${fileId}/content`)).status).toBe(
      200,
    );
    expect(
      (
        await member.get(
          `/api/v1/projects/${projectId}/documents/${document.id}`,
        )
      ).status,
    ).toBe(200);
  });

  it("retires an unclaimed staged upload: the row becomes deleted and its bytes are removed", async () => {
    const fileId = await stagePdf(member, "Abandoned.pdf");
    await ageStaged([fileId]);
    expect(await sweeper().sweepStagedUploads()).toBeGreaterThanOrEqual(1);
    const row = await fileRow(fileId);
    expect(row.status).toBe("deleted");
    expect(await context.storage.storage.exists(row.storage_key)).toBe(false);
  });

  it("if byte removal fails after the row is retired, the sweep continues and leaves only a recoverable orphan", async () => {
    const failing: FileStorage = {
      ...context.storage.storage,
      delete: async () => {
        throw new Error("storage unavailable");
      },
    };
    const ids = [
      await stagePdf(member, "Orphan-1.pdf"),
      await stagePdf(member, "Orphan-2.pdf"),
    ];
    await ageStaged(ids);
    expect(await sweeper(failing).sweepStagedUploads()).toBeGreaterThanOrEqual(
      2,
    );
    for (const id of ids) {
      const row = await fileRow(id);
      expect(row.status).toBe("deleted");
      expect(await context.storage.storage.exists(row.storage_key)).toBe(true);
      expect((await member.get(`/api/v1/files/${id}/content`)).status).toBe(
        404,
      );
    }
  });
});

describe("budget: department deletion is compare-and-set", () => {
  const budget = () => `/api/v1/projects/${projectId}/budget`;
  const deletedEvents = (departmentId: string) =>
    count(
      "SELECT count(*)::int AS n FROM audit_events WHERE action = 'budget_department.deleted' AND entity_id = $1",
      [departmentId],
    );
  const departmentExists = async (departmentId: string) =>
    (await count(
      "SELECT count(*)::int AS n FROM budget_departments WHERE id = $1",
      [departmentId],
    )) === 1;
  type Department = {
    id: string;
    name: string;
    version: number;
    lineItems: unknown[];
    documents: unknown[];
  };

  it("requires the version: stale is 409 with nothing deleted or audited; current deletes once; a repeat is 404", async () => {
    const created = await member.post(budget()).send({ currency: "GBP" });
    expect(created.status).toBe(201);
    const department: Department =
      created.body.data.currentVersion.departments[0];
    const url = `${budget()}/departments/${department.id}`;
    const renamed = await member
      .patch(url)
      .send({ name: "Renamed Department", version: department.version });
    expect(renamed.status).toBe(200);
    const current = (renamed.body.data.departments as Department[]).find(
      (d) => d.id === department.id,
    );
    expect(current?.version).toBe(department.version + 1);

    const missing = await member.delete(url).send({});
    expect(missing.status).toBe(400);

    const stale = await member
      .delete(url)
      .send({ version: department.version });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
    expect(await departmentExists(department.id)).toBe(true);
    expect(await deletedEvents(department.id)).toBe(0);

    const removed = await member
      .delete(url)
      .send({ version: current?.version });
    expect(removed.status).toBe(200);
    expect(
      (removed.body.data.departments as Department[]).map((d) => d.id),
    ).not.toContain(department.id);
    expect(await departmentExists(department.id)).toBe(false);
    expect(await deletedEvents(department.id)).toBe(1);

    const again = await member.delete(url).send({ version: current?.version });
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe("BUDGET_DEPARTMENT_NOT_FOUND");
    expect(await deletedEvents(department.id)).toBe(1);
  });

  it("two concurrent deletes of one department: one removes it, the other deletes zero rows and is refused", async () => {
    const version = (await member.get(budget())).body.data.currentVersion;
    const department = (version.departments as Department[]).find(
      (d) => d.lineItems.length === 0 && d.documents.length === 0,
    );
    if (!department)
      throw new Error("The default budget has empty departments.");
    const url = `${budget()}/departments/${department.id}`;

    // Barrier: the draft version row every department command locks. Both
    // deletes have loaded the department before either may delete it.
    await barrier.query("BEGIN");
    await barrier.query(
      "SELECT id FROM budget_versions WHERE id = $1 FOR UPDATE",
      [version.id],
    );
    const racing = [member, admin].map((agent) =>
      send(agent.delete(url).send({ version: department.version })),
    );
    await waitForLockWaiters(watcher, 2);
    await barrier.query("ROLLBACK");
    const results = await Promise.all(racing);

    expect(statuses(results)).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)?.body.error.code).toBe(
      "VERSION_CONFLICT",
    );
    expect(await departmentExists(department.id)).toBe(false);
    expect(await deletedEvents(department.id)).toBe(1);
  });
});

describe("legal records: concurrent detach of one document", () => {
  it("one detach succeeds; the other removes zero rows and is ATTACHMENT_NOT_FOUND with no audit event", async () => {
    const records = `/api/v1/projects/${projectId}/legal-records`;
    const record = await member.post(records).send({
      name: "Race Writer",
      details: { category: "writer_agreements", role: "Co-writer" },
    });
    expect(record.status).toBe(201);
    const recordId = record.body.data.id as string;
    const attached = await member
      .post(`${records}/${recordId}/documents`)
      .send({
        fileObjectId: await stagePdf(member, "Agreement.pdf"),
        title: "Agreement",
      });
    expect(attached.status).toBe(201);
    const document = attached.body.data.documents[0];
    const url = `${records}/${recordId}/documents/${document.id}`;
    const detachedEvents = () =>
      count(
        "SELECT count(*)::int AS n FROM audit_events WHERE action = 'legal_record.document_detached' AND entity_id = $1",
        [recordId],
      );

    // Barrier: the link row itself. Both detaches have found the link before
    // either may delete it.
    await barrier.query("BEGIN");
    await barrier.query(
      "SELECT 1 FROM legal_record_documents WHERE legal_record_id = $1 AND document_lineage_id = $2 FOR UPDATE",
      [recordId, document.lineageId],
    );
    // Both as the record's creator: earlier suites in this file may have
    // demoted the seeded admin, and the race is about the link, not policy.
    const racing = [send(member.delete(url)), send(member.delete(url))];
    await waitForLockWaiters(watcher, 2);
    await barrier.query("ROLLBACK");
    const results = await Promise.all(racing);

    expect(statuses(results)).toEqual([200, 404]);
    expect(results.find((r) => r.status === 404)?.body.error.code).toBe(
      "ATTACHMENT_NOT_FOUND",
    );
    expect(await detachedEvents()).toBe(1);

    const repeat = await member.delete(url);
    expect(repeat.status).toBe(404);
    expect(repeat.body.error.code).toBe("ATTACHMENT_NOT_FOUND");
    expect(await detachedEvents()).toBe(1);
    expect(
      await count(
        "SELECT count(*)::int AS n FROM legal_record_documents WHERE legal_record_id = $1",
        [recordId],
      ),
    ).toBe(0);
    expect(
      await count(
        "SELECT count(*)::int AS n FROM documents WHERE lineage_id = $1 AND deleted_at IS NULL",
        [document.lineageId],
      ),
      "the document lineage is untouched by a detach",
    ).toBe(1);
  });
});
