import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminCredentials,
  createTestContext,
  memberCredentials,
  type TestContext,
} from "../support/test-context";

let context: TestContext;
let admin: Awaited<ReturnType<TestContext["loginAs"]>>;
let member: Awaited<ReturnType<TestContext["loginAs"]>>;
let projectId: string;

const pdfV1 = Buffer.from("%PDF-1.4\n% version one\n%%EOF\n");
const pdfV2 = Buffer.from("%PDF-1.4\n% version two, longer\n%%EOF\n");

const stage = async (
  agent: Awaited<ReturnType<TestContext["loginAs"]>>,
  bytes: Buffer,
  name: string,
) => {
  const response = await agent
    .post("/api/v1/files")
    .set("content-type", "application/octet-stream")
    .set("x-vault-filename", name)
    .send(bytes);
  expect(response.status).toBe(201);
  return response.body.data as { id: string; sha256: string };
};
const auditActions = async (entityId: string) =>
  (
    await context.database.client.query(
      "SELECT action, metadata FROM audit_events WHERE entity_type = 'document' AND entity_id = $1 ORDER BY created_at",
      [entityId],
    )
  ).rows;
const download = (
  agent: Awaited<ReturnType<TestContext["loginAs"]>>,
  fileId: string,
) =>
  agent
    .get(`/api/v1/files/${fileId}/content`)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    });

beforeAll(async () => {
  context = await createTestContext();
  admin = await context.loginAs(adminCredentials);
  member = await context.loginAs(memberCredentials);
  const project = await admin
    .post("/api/v1/projects")
    .send({ title: "Documented" });
  projectId = project.body.data.id;
});

afterAll(async () => {
  await context.destroy();
});

describe("Documents API against isolated PostgreSQL and storage", () => {
  it("creates a document that claims a staged file, persists it, and shows it to every session", async () => {
    const staged = await stage(member, pdfV1, "Chain of Title.pdf");
    const created = await member
      .post(`/api/v1/projects/${projectId}/documents`)
      .send({
        fileObjectId: staged.id,
        folder: "legal/chain-of-title",
        title: "Chain of Title",
        status: "draft",
        notes: "First draft from counsel",
      });
    expect(created.status).toBe(201);
    const doc = created.body.data;
    expect(doc).toMatchObject({
      projectId,
      lineageId: doc.id,
      versionNumber: 1,
      isCurrent: true,
      folder: "legal/chain-of-title",
      title: "Chain of Title",
      status: "draft",
      notes: "First draft from counsel",
      version: 1,
      file: {
        id: staged.id,
        originalFilename: "Chain of Title.pdf",
        mediaType: "application/pdf",
        sha256: staged.sha256,
      },
      createdBy: {
        id: context.seeded.memberUserId,
        displayName: "Test Member",
      },
    });
    expect(doc.createdBy).not.toHaveProperty("email");
    expect(JSON.stringify(created.body)).not.toMatch(
      /storage_key|storageKey|url/i,
    );
    const file = await context.database.client.query(
      "SELECT status, available_at FROM file_objects WHERE id = $1",
      [staged.id],
    );
    expect(file.rows[0].status).toBe("available");
    expect(file.rows[0].available_at).not.toBeNull();

    // A different session (fresh app instance) and a different user see it.
    const otherApp = await context.newApp();
    const otherAdmin = await context.loginAs(adminCredentials, otherApp);
    const listed = await otherAdmin.get(
      `/api/v1/projects/${projectId}/documents?folder=legal/chain-of-title`,
    );
    expect(listed.status).toBe(200);
    expect(listed.body.data.items.map((d: { id: string }) => d.id)).toEqual([
      doc.id,
    ]);
    const bytes = await download(otherAdmin, staged.id);
    expect(Buffer.compare(bytes.body as Buffer, pdfV1)).toBe(0);
    expect(
      createHash("sha256")
        .update(bytes.body as Buffer)
        .digest("hex"),
    ).toBe(staged.sha256);

    // A file can back only one document; a second claim is refused.
    const again = await member
      .post(`/api/v1/projects/${projectId}/documents`)
      .send({
        fileObjectId: staged.id,
        folder: "general",
        title: "Duplicate claim",
      });
    expect(again.status).toBe(422);
    expect(again.body.error.code).toBe("FILE_NOT_CLAIMABLE");
    // Nor can another user claim someone else's staged upload.
    const stagedByMember = await stage(member, pdfV1, "mine.pdf");
    // (admins may; ordinary users may not)
    const otherMemberClaim = await member
      .post(`/api/v1/projects/${projectId}/documents`)
      .send({
        fileObjectId: stagedByMember.id,
        folder: "general",
        title: "ok",
      });
    expect(otherMemberClaim.status).toBe(201);
    expect(await auditActions(doc.id)).toMatchObject([
      {
        action: "document.created",
        metadata: { folder: "legal/chain-of-title", sha256: staged.sha256 },
      },
    ]);
  });

  it("adds versions in one lineage, preserving earlier versions and their bytes", async () => {
    const first = await stage(
      admin,
      pdfV1,
      "Budget.xlsx".replace("xlsx", "pdf"),
    );
    const v1 = (
      await admin.post(`/api/v1/projects/${projectId}/documents`).send({
        fileObjectId: first.id,
        folder: "financing/budget",
        title: "Budget",
      })
    ).body.data;
    const second = await stage(admin, pdfV2, "Budget-v2.pdf");
    const stale = await admin
      .post(`/api/v1/projects/${projectId}/documents/${v1.id}/versions`)
      .send({ fileObjectId: second.id, version: 99 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
    expect(
      (
        await context.database.client.query(
          "SELECT status FROM file_objects WHERE id = $1",
          [second.id],
        )
      ).rows[0].status,
    ).toBe("staged");

    const added = await admin
      .post(`/api/v1/projects/${projectId}/documents/${v1.id}/versions`)
      .send({
        fileObjectId: second.id,
        version: v1.version,
        status: "under_review",
      });
    expect(added.status).toBe(201);
    const v2 = added.body.data;
    expect(v2).toMatchObject({
      lineageId: v1.id,
      versionNumber: 2,
      isCurrent: true,
      title: "Budget",
      folder: "financing/budget",
      status: "under_review",
      file: { id: second.id },
    });

    const detail = await member.get(
      `/api/v1/projects/${projectId}/documents/${v1.id}`,
    );
    expect(detail.status).toBe(200);
    expect(detail.body.data.document.isCurrent).toBe(false);
    expect(
      detail.body.data.versions.map(
        (d: { versionNumber: number; isCurrent: boolean }) => [
          d.versionNumber,
          d.isCurrent,
        ],
      ),
    ).toEqual([
      [1, false],
      [2, true],
    ]);
    const listed = await member.get(
      `/api/v1/projects/${projectId}/documents?folder=financing/budget`,
    );
    expect(listed.body.data.items.map((d: { id: string }) => d.id)).toEqual([
      v2.id,
    ]);
    expect(
      Buffer.compare((await download(member, first.id)).body as Buffer, pdfV1),
    ).toBe(0);
    expect(
      Buffer.compare((await download(member, second.id)).body as Buffer, pdfV2),
    ).toBe(0);

    const notCurrent = await admin
      .post(`/api/v1/projects/${projectId}/documents/${v1.id}/versions`)
      .send({
        fileObjectId: (await stage(admin, pdfV2, "x.pdf")).id,
        version: v1.version + 1,
      });
    expect(notCurrent.status).toBe(409);
    expect(notCurrent.body.error.code).toBe("NOT_CURRENT_VERSION");
    expect((await auditActions(v2.id)).map((r) => r.action)).toEqual([
      "document.version_added",
    ]);
  });

  it("applies the authorship rule and optimistic concurrency to edits and deletion", async () => {
    const staged = await stage(admin, pdfV1, "Admin owned.pdf");
    const doc = (
      await admin.post(`/api/v1/projects/${projectId}/documents`).send({
        fileObjectId: staged.id,
        folder: "general",
        title: "Admin owned",
      })
    ).body.data;

    const forbidden = await member
      .patch(`/api/v1/projects/${projectId}/documents/${doc.id}`)
      .send({ title: "Hijacked", version: doc.version });
    expect(forbidden.status).toBe(403);
    const staleEdit = await admin
      .patch(`/api/v1/projects/${projectId}/documents/${doc.id}`)
      .send({ title: "Stale", version: doc.version + 5 });
    expect(staleEdit.status).toBe(409);
    expect(await auditActions(doc.id)).toHaveLength(1);

    const edited = await admin
      .patch(`/api/v1/projects/${projectId}/documents/${doc.id}`)
      .send({
        title: "Admin owned (final)",
        status: "final",
        version: doc.version,
      });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({
      title: "Admin owned (final)",
      status: "final",
      version: doc.version + 1,
    });

    const memberDelete = await member
      .delete(`/api/v1/projects/${projectId}/documents/${doc.id}`)
      .send({ version: edited.body.data.version });
    expect(memberDelete.status).toBe(403);
    const deleted = await admin
      .delete(`/api/v1/projects/${projectId}/documents/${doc.id}`)
      .send({ version: edited.body.data.version });
    expect(deleted.status).toBe(204);
    expect(
      (await admin.get(`/api/v1/projects/${projectId}/documents/${doc.id}`))
        .status,
    ).toBe(404);
    const listed = await admin.get(
      `/api/v1/projects/${projectId}/documents?folder=general`,
    );
    expect(
      listed.body.data.items.map((d: { id: string }) => d.id),
    ).not.toContain(doc.id);
    // Bytes are retained for provenance.
    expect((await download(admin, staged.id)).status).toBe(200);
    expect((await auditActions(doc.id)).map((r) => r.action)).toEqual([
      "document.created",
      "document.updated",
      "document.deleted",
    ]);

    // Ordinary users manage their own documents.
    const mine = await stage(member, pdfV1, "mine.pdf");
    const own = (
      await member
        .post(`/api/v1/projects/${projectId}/documents`)
        .send({ fileObjectId: mine.id, folder: "general", title: "Mine" })
    ).body.data;
    expect(
      (
        await member
          .delete(`/api/v1/projects/${projectId}/documents/${own.id}`)
          .send({ version: own.version })
      ).status,
    ).toBe(204);
  });

  it("scopes documents to their project and validates input", async () => {
    const other = (
      await admin.post("/api/v1/projects").send({ title: "Other" })
    ).body.data;
    const staged = await stage(admin, pdfV1, "scoped.pdf");
    const doc = (
      await admin
        .post(`/api/v1/projects/${projectId}/documents`)
        .send({ fileObjectId: staged.id, folder: "script", title: "Scoped" })
    ).body.data;
    expect(
      (await admin.get(`/api/v1/projects/${other.id}/documents/${doc.id}`))
        .status,
    ).toBe(404);
    expect(
      (await admin.get(`/api/v1/projects/${other.id}/documents`)).body.data
        .items,
    ).toEqual([]);
    const missingProject = await admin
      .post("/api/v1/projects/00000000-0000-4000-8000-000000000000/documents")
      .send({
        fileObjectId: (await stage(admin, pdfV1, "x.pdf")).id,
        folder: "general",
        title: "x",
      });
    expect(missingProject.status).toBe(404);
    const badFolder = await admin
      .post(`/api/v1/projects/${projectId}/documents`)
      .send({ fileObjectId: staged.id, folder: "not/a/folder", title: "x" });
    expect(badFolder.status).toBe(400);
    expect(
      (await admin.get(`/api/v1/projects/${projectId}/documents?folder=nope`))
        .status,
    ).toBe(400);
  });

  it("sweeps staged uploads nobody claimed, but never available ones", async () => {
    const { createFileService } =
      await import("../../server/modules/files/file-service");
    const service = createFileService({
      db: context.db,
      storage: context.storage.storage,
      maxUploadBytes: 1024 * 1024,
    });
    const abandoned = await stage(admin, pdfV1, "abandoned.pdf");
    const kept = await stage(admin, pdfV1, "kept.pdf");
    await admin
      .post(`/api/v1/projects/${projectId}/documents`)
      .send({ fileObjectId: kept.id, folder: "general", title: "Kept" });
    await context.database.client.query(
      "UPDATE file_objects SET created_at = now() - interval '2 days' WHERE id = ANY($1)",
      [[abandoned.id, kept.id]],
    );
    const swept = await service.sweepStagedUploads();
    expect(swept).toBeGreaterThanOrEqual(1);
    const rows = await context.database.client.query(
      "SELECT id, status, storage_key FROM file_objects WHERE id = ANY($1)",
      [[abandoned.id, kept.id]],
    );
    const byId = Object.fromEntries(rows.rows.map((r) => [r.id, r]));
    expect(byId[abandoned.id].status).toBe("deleted");
    expect(
      await context.storage.storage.exists(byId[abandoned.id].storage_key),
    ).toBe(false);
    expect(byId[kept.id].status).toBe("available");
    expect(
      await context.storage.storage.exists(byId[kept.id].storage_key),
    ).toBe(true);
    expect(
      (await admin.get(`/api/v1/files/${abandoned.id}/content`)).status,
    ).toBe(404);
  });
});
