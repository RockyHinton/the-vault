import { createHash } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPdf } from "../support/pdf-fixture";
import {
  adminCredentials,
  createTestContext,
  memberCredentials,
  type TestContext,
} from "../support/test-context";

type Agent = Awaited<ReturnType<TestContext["loginAs"]>>;

let context: TestContext;
let admin: Agent;
let member: Agent;
let projectId: string;
let otherProjectId: string;
let memberId: string;
let adminId: string;

const scripts = (id = projectId) => `/api/v1/projects/${id}/scripts`;
const v1Bytes = buildPdf(["FADE IN:", "INT. HARBOUR - NIGHT"]);
const v2Bytes = buildPdf([
  "FADE IN:",
  "INT. HARBOUR - NIGHT (REVISED)",
  "EXT. PIER - DAWN",
]);
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

const stage = async (agent: Agent, name: string, bytes: Buffer) => {
  const response = await agent
    .post("/api/v1/files")
    .set("content-type", "application/octet-stream")
    .set("x-vault-filename", name)
    .send(bytes);
  expect(response.status).toBe(201);
  return response.body.data.id as string;
};
const download = (agent: Agent, fileId: string) =>
  agent
    .get(`/api/v1/files/${fileId}/content`)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    });
const auditActions = async (entityType: string, entityId: string) =>
  (
    await context.database.client.query(
      "SELECT action, metadata FROM audit_events WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at",
      [entityType, entityId],
    )
  ).rows as { action: string; metadata: Record<string, unknown> }[];

beforeAll(async () => {
  context = await createTestContext();
  admin = await context.loginAs(adminCredentials);
  member = await context.loginAs(memberCredentials);
  projectId = (
    await admin.post("/api/v1/projects").send({ title: "Harbour Lights" })
  ).body.data.id;
  otherProjectId = (
    await admin.post("/api/v1/projects").send({ title: "Elsewhere" })
  ).body.data.id;
  memberId = (await member.get("/api/v1/auth/me")).body.data.user.id;
  adminId = (await admin.get("/api/v1/auth/me")).body.data.user.id;
});

afterAll(async () => {
  await context.destroy();
});

describe("scripts: creation and provenance", () => {
  it("a project starts with no scripts and none appear by reading", async () => {
    expect((await member.get(scripts())).body.data.items).toEqual([]);
  });

  it("creates a script from a real upload: the document lineage is version 1 with exact file provenance", async () => {
    const fileId = await stage(member, "Harbour Lights.pdf", v1Bytes);
    const created = await member.post(scripts()).send({
      fileObjectId: fileId,
      title: "Harbour Lights",
      createdBy: { id: "spoofed" },
    });
    expect(created.status).toBe(201);
    const { script, versions } = created.body.data;
    expect(script).toMatchObject({
      projectId,
      title: "Harbour Lights",
      versionCount: 1,
      createdBy: { id: memberId },
    });
    expect(script.createdBy).not.toHaveProperty("email");
    expect(script.currentVersion).toMatchObject({
      id: script.documentLineageId,
      lineageId: script.documentLineageId,
      versionNumber: 1,
      isCurrent: true,
      folder: "script",
      file: { id: fileId, sha256: sha(v1Bytes), byteSize: v1Bytes.length },
    });
    expect(script.currentVersion.file).not.toHaveProperty("storageKey");
    expect(
      versions.map((v: { versionNumber: number }) => v.versionNumber),
    ).toEqual([1]);
    const list = await admin.get(scripts());
    expect(list.body.data.items.map((s: { id: string }) => s.id)).toEqual([
      script.id,
    ]);
    expect(await auditActions("script", script.id)).toEqual([
      {
        action: "script.created",
        metadata: {
          projectId,
          documentLineageId: script.documentLineageId,
          documentId: script.currentVersion.id,
          sha256: sha(v1Bytes),
        },
      },
    ]);
    const documentEvents = await auditActions(
      "document",
      script.currentVersion.id,
    );
    expect(documentEvents.map((row) => row.action)).toEqual([
      "document.created",
    ]);
  });

  it("refuses a non-PDF upload as a script (server-detected type), leaving no script, document or audit", async () => {
    const textFile = await stage(
      member,
      "Outline.txt",
      Buffer.from("FADE IN:\nA plain-text outline.\n"),
    );
    const refused = await member
      .post(scripts())
      .send({ fileObjectId: textFile, title: "Outline" });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("SCRIPT_FORMAT_UNSUPPORTED");
    expect(refused.body.error.details).toEqual({
      mediaType: "text/plain",
      supported: ["application/pdf"],
    });
    const rows = await context.database.client.query(
      "SELECT (SELECT count(*)::int FROM scripts WHERE project_id = $1) AS scripts, (SELECT count(*)::int FROM documents WHERE project_id = $1) AS documents, (SELECT status FROM file_objects WHERE id = $2) AS file_status",
      [projectId, textFile],
    );
    expect(rows.rows[0]).toEqual({
      scripts: 1,
      documents: 1,
      file_status: "staged",
    });
    // Exactly the one script event from the successful creation above; nothing from the refusal.
    const events = await context.database.client.query(
      "SELECT count(*)::int AS n FROM audit_events WHERE entity_type = 'script'",
    );
    expect(events.rows[0].n).toBe(1);
    // The Files/Documents policy is untouched: the same text file is a fine ordinary document.
    const asDocument = await member
      .post(`/api/v1/projects/${projectId}/documents`)
      .send({ fileObjectId: textFile, folder: "general", title: "Outline" });
    expect(asDocument.status).toBe(201);
    expect(asDocument.body.data.file.mediaType).toBe("text/plain");
  });

  it("refuses a claimed or foreign file and leaves no script behind", async () => {
    const [{ id: fileId }] = (
      await context.database.client.query(
        "SELECT id FROM file_objects WHERE status = 'available' LIMIT 1",
      )
    ).rows;
    const reused = await member
      .post(scripts())
      .send({ fileObjectId: fileId, title: "Again" });
    expect(reused.status).toBe(422);
    const adminStaged = await stage(admin, "Private.pdf", v1Bytes);
    const foreign = await member
      .post(scripts())
      .send({ fileObjectId: adminStaged, title: "Not mine" });
    expect(foreign.status).toBe(422);
    const rows = await context.database.client.query(
      "SELECT count(*)::int AS n FROM scripts WHERE project_id = $1",
      [projectId],
    );
    expect(rows.rows[0].n).toBe(1);
  });

  it("a script is unreachable through another project's routes", async () => {
    const script = (await member.get(scripts())).body.data.items[0];
    expect(
      (await admin.get(`${scripts(otherProjectId)}/${script.id}`)).status,
    ).toBe(404);
    const fileId = await stage(admin, "Other.pdf", v2Bytes);
    expect(
      (
        await admin
          .post(`${scripts(otherProjectId)}/${script.id}/versions`)
          .send({ fileObjectId: fileId, currentDocumentVersion: 1 })
      ).status,
    ).toBe(404);
    expect(
      (
        await admin.get(
          `${scripts(otherProjectId)}/${script.id}/versions/${script.currentVersion.id}/annotations`,
        )
      ).status,
    ).toBe(404);
    expect((await admin.get(scripts(otherProjectId))).body.data.items).toEqual(
      [],
    );
  });
});

describe("scripts: annotations bound to exact versions", () => {
  let scriptId: string;
  let v1Id: string;

  beforeAll(async () => {
    const script = (await member.get(scripts())).body.data.items[0];
    scriptId = script.id;
    v1Id = script.currentVersion.id;
  });

  it("creates a note on the exact version with the session author, ordered by page then time", async () => {
    const second = await admin
      .post(`${scripts()}/${scriptId}/versions/${v1Id}/annotations`)
      .send({
        pageNumber: 2,
        x: 10,
        y: 40.5,
        type: "commercial",
        tag: "budget_impact",
        body: "Pier build is expensive.",
        author: { id: "spoofed" },
      });
    expect(second.status).toBe(201);
    const first = await member
      .post(`${scripts()}/${scriptId}/versions/${v1Id}/annotations`)
      .send({
        pageNumber: 1,
        x: 5,
        y: 12.25,
        type: "creative",
        body: "Strong opening image.",
      });
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({
      scriptId,
      documentId: v1Id,
      author: { id: memberId },
      pageNumber: 1,
      x: 5,
      y: 12.25,
      type: "creative",
      tag: null,
      version: 1,
    });
    expect(second.body.data.author.id).toBe(adminId);
    const list = await member.get(
      `${scripts()}/${scriptId}/versions/${v1Id}/annotations`,
    );
    expect(
      list.body.data.items.map((a: { pageNumber: number }) => a.pageNumber),
    ).toEqual([1, 2]);
    expect(
      (await auditActions("script_annotation", first.body.data.id))[0],
    ).toMatchObject({
      action: "script_annotation.created",
      metadata: { scriptId, documentId: v1Id, versionNumber: 1, pageNumber: 1 },
    });
  });

  it("rejects notes against a document that is not a version of this script and invalid positions", async () => {
    const fileId = await stage(admin, "Unrelated.pdf", v2Bytes);
    const unrelated = await admin
      .post(`/api/v1/projects/${projectId}/documents`)
      .send({ fileObjectId: fileId, folder: "general", title: "Unrelated" });
    const wrongVersion = await admin
      .post(
        `${scripts()}/${scriptId}/versions/${unrelated.body.data.id}/annotations`,
      )
      .send({ pageNumber: 1, x: 1, y: 1, type: "question", body: "?" });
    expect(wrongVersion.status).toBe(404);
    expect(wrongVersion.body.error.code).toBe("SCRIPT_VERSION_NOT_FOUND");
    const outOfPage = await admin
      .post(`${scripts()}/${scriptId}/versions/${v1Id}/annotations`)
      .send({ pageNumber: 1, x: 101, y: 1, type: "question", body: "?" });
    expect(outOfPage.status).toBe(400);
    await expect(
      context.database.client.query(
        `INSERT INTO script_annotations (script_id, document_id, author_user_id, page_number, position_x, position_y, note_type, body)
         VALUES ($1, $2, $3, 0, 1, 1, 'creative', 'x')`,
        [scriptId, v1Id, memberId],
      ),
    ).rejects.toThrow(/script_annotations_page_positive/);
  });

  it("author-or-admin edits and deletes with a version; another user is refused; conflicts leave no audit", async () => {
    const list = await member.get(
      `${scripts()}/${scriptId}/versions/${v1Id}/annotations`,
    );
    const mine = list.body.data.items.find(
      (a: { author: { id: string } }) => a.author.id === memberId,
    );
    const theirs = list.body.data.items.find(
      (a: { author: { id: string } }) => a.author.id === adminId,
    );
    expect(
      (
        await member
          .patch(`${scripts()}/${scriptId}/annotations/${theirs.id}`)
          .send({ body: "Hijacked", version: theirs.version })
      ).status,
    ).toBe(403);
    expect(
      (
        await member
          .patch(`${scripts()}/${scriptId}/annotations/${mine.id}`)
          .send({ body: "Stale", version: mine.version + 1 })
      ).status,
    ).toBe(409);
    const edited = await member
      .patch(`${scripts()}/${scriptId}/annotations/${mine.id}`)
      .send({
        body: "Strong opening image; keep it.",
        tag: "structure",
        version: mine.version,
      });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({
      body: "Strong opening image; keep it.",
      tag: "structure",
      version: 2,
    });
    expect(
      (
        await member
          .delete(`${scripts()}/${scriptId}/annotations/${theirs.id}`)
          .send({ version: theirs.version })
      ).status,
    ).toBe(403);
    const byAdmin = await admin
      .patch(`${scripts()}/${scriptId}/annotations/${mine.id}`)
      .send({ type: "question", version: 2 });
    expect(byAdmin.status).toBe(200);
    expect(
      (await auditActions("script_annotation", mine.id)).map(
        (row) => row.action,
      ),
    ).toEqual([
      "script_annotation.created",
      "script_annotation.updated",
      "script_annotation.updated",
    ]);
  });
});

describe("scripts: new versions keep provenance", () => {
  let scriptId: string;
  let v1Id: string;
  let v1FileId: string;
  let v2Id: string;

  beforeAll(async () => {
    const script = (await member.get(scripts())).body.data.items[0];
    scriptId = script.id;
    v1Id = script.currentVersion.id;
    v1FileId = script.currentVersion.file.id;
  });

  it("adds version 2 in the same lineage; stale current version is refused without a new row", async () => {
    const script = (await member.get(`${scripts()}/${scriptId}`)).body.data
      .script;
    const fileA = await stage(admin, "Harbour Lights v2.pdf", v2Bytes);
    const stale = await admin.post(`${scripts()}/${scriptId}/versions`).send({
      fileObjectId: fileA,
      currentDocumentVersion: script.currentVersion.version + 1,
    });
    expect(stale.status).toBe(409);
    const added = await admin.post(`${scripts()}/${scriptId}/versions`).send({
      fileObjectId: fileA,
      currentDocumentVersion: script.currentVersion.version,
    });
    expect(added.status).toBe(201);
    const detail = added.body.data;
    v2Id = detail.script.currentVersion.id;
    expect(detail.script.currentVersion).toMatchObject({
      lineageId: script.documentLineageId,
      versionNumber: 2,
      isCurrent: true,
      file: { sha256: sha(v2Bytes) },
      createdBy: { id: adminId },
    });
    expect(detail.script.versionCount).toBe(2);
    expect(
      detail.versions.map(
        (v: { versionNumber: number; isCurrent: boolean }) => [
          v.versionNumber,
          v.isCurrent,
        ],
      ),
    ).toEqual([
      [1, false],
      [2, true],
    ]);
    expect(
      (await auditActions("script", scriptId)).map((row) => row.action),
    ).toEqual(["script.created", "script.version_added"]);
  });

  it("refuses a non-PDF new version and leaves the current version untouched", async () => {
    const textFile = await stage(
      admin,
      "Revision.txt",
      Buffer.from("INT. HARBOUR - NIGHT (as text)\n"),
    );
    const before = (await member.get(`${scripts()}/${scriptId}`)).body.data
      .script;
    const refused = await admin.post(`${scripts()}/${scriptId}/versions`).send({
      fileObjectId: textFile,
      currentDocumentVersion: before.currentVersion.version,
    });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("SCRIPT_FORMAT_UNSUPPORTED");
    const after = (await member.get(`${scripts()}/${scriptId}`)).body.data;
    expect(after.script.currentVersion).toEqual(before.currentVersion);
    expect(after.versions).toHaveLength(2);
    expect(
      (await auditActions("script", scriptId)).map((row) => row.action),
    ).toEqual(["script.created", "script.version_added"]);
  });

  it("version 1 bytes and annotations stay exactly where they were; version 2 inherits nothing", async () => {
    const v1 = await download(member, v1FileId);
    expect(v1.status).toBe(200);
    expect(sha(v1.body as Buffer)).toBe(sha(v1Bytes));
    const v1Notes = await member.get(
      `${scripts()}/${scriptId}/versions/${v1Id}/annotations`,
    );
    expect(v1Notes.body.data.items).toHaveLength(2);
    const v2Notes = await member.get(
      `${scripts()}/${scriptId}/versions/${v2Id}/annotations`,
    );
    expect(v2Notes.body.data.items).toEqual([]);
    const onV2 = await member
      .post(`${scripts()}/${scriptId}/versions/${v2Id}/annotations`)
      .send({
        pageNumber: 3,
        x: 0,
        y: 0,
        type: "concern",
        body: "New dawn scene needs a permit.",
      });
    expect(onV2.status).toBe(201);
    expect(
      (
        await member.get(
          `${scripts()}/${scriptId}/versions/${v1Id}/annotations`,
        )
      ).body.data.items,
    ).toHaveLength(2);
  });

  it("bytes are served only to authenticated users and expose no storage key", async () => {
    const anonymous = await request(await context.newApp()).get(
      `/api/v1/files/${v1FileId}/content`,
    );
    expect(anonymous.status).toBe(401);
    const detail = (await member.get(`${scripts()}/${scriptId}`)).body.data;
    expect(JSON.stringify(detail)).not.toMatch(
      /storageKey|\.vault-data|vault_test_storage/,
    );
  });

  it("removing a script is creator-or-admin, soft, and keeps documents, bytes and notes", async () => {
    expect((await admin.delete(`${scripts()}/${scriptId}`)).status).toBe(204);
    expect((await member.get(`${scripts()}/${scriptId}`)).status).toBe(404);
    expect((await member.get(scripts())).body.data.items).toEqual([]);
    const lineage = await member.get(
      `/api/v1/projects/${projectId}/documents/${v1Id}`,
    );
    expect(lineage.status).toBe(200);
    expect(lineage.body.data.versions).toHaveLength(2);
    expect((await download(member, v1FileId)).status).toBe(200);
    const notes = await context.database.client.query(
      "SELECT count(*)::int AS n FROM script_annotations WHERE script_id = $1 AND deleted_at IS NULL",
      [scriptId],
    );
    expect(notes.rows[0].n).toBe(3);
    expect(
      (await auditActions("script", scriptId)).map((row) => row.action).at(-1),
    ).toBe("script.deleted");
  });

  it("a member cannot remove a script the admin created", async () => {
    const fileId = await stage(admin, "Second.pdf", v1Bytes);
    const created = await admin
      .post(scripts())
      .send({ fileObjectId: fileId, title: "Second" });
    expect(
      (await member.delete(`${scripts()}/${created.body.data.script.id}`))
        .status,
    ).toBe(403);
  });
});

describe("scripts: the Documents library is not a second path to a live script's lineage", () => {
  let guardedProjectId: string;
  let scriptId: string;
  const documents = () => `/api/v1/projects/${guardedProjectId}/documents`;
  /** A zip container named .docx: accepted by Files as an ordinary Word document. */
  const docxBytes = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.alloc(64, 1),
  ]);
  const auditCount = async () =>
    (
      await context.database.client.query(
        "SELECT count(*)::int AS n FROM audit_events",
      )
    ).rows[0].n as number;
  const fileStatus = async (fileId: string) =>
    (
      await context.database.client.query(
        "SELECT status FROM file_objects WHERE id = $1",
        [fileId],
      )
    ).rows[0].status as string;
  const currentVersion = async () =>
    (await member.get(`${scripts(guardedProjectId)}/${scriptId}`)).body.data
      .script.currentVersion as {
      id: string;
      version: number;
      versionNumber: number;
      folder: string;
      title: string;
    };

  beforeAll(async () => {
    guardedProjectId = (
      await admin.post("/api/v1/projects").send({ title: "Guarded" })
    ).body.data.id;
    const created = await member.post(scripts(guardedProjectId)).send({
      fileObjectId: await stage(member, "Guarded.pdf", v1Bytes),
      title: "Guarded",
    });
    expect(created.status).toBe(201);
    scriptId = created.body.data.script.id;
  });

  it("refuses a generic new version (non-PDF or PDF) before claiming, versioning or auditing", async () => {
    const before = await currentVersion();
    const auditBefore = await auditCount();
    const docx = await stage(member, "Revision.docx", docxBytes);
    const pdf = await stage(member, "Revision.pdf", v2Bytes);
    for (const fileObjectId of [docx, pdf]) {
      for (const agent of [member, admin]) {
        const refused = await agent
          .post(`${documents()}/${before.id}/versions`)
          .send({ fileObjectId, version: before.version });
        expect(refused.status).toBe(409);
        expect(refused.body.error.code).toBe("DOCUMENT_BACKS_SCRIPT");
      }
      expect(await fileStatus(fileObjectId)).toBe("staged");
    }
    expect(await currentVersion()).toEqual(before);
    const lineage = await member.get(`${documents()}/${before.id}`);
    expect(lineage.body.data.versions).toHaveLength(1);
    expect(await auditCount()).toBe(auditBefore);

    // The Scripts command remains the one path: its PDF rule refuses the
    // Word file and accepts the PDF as version 2 of the same lineage.
    const viaScripts = (fileObjectId: string, version: number) =>
      member
        .post(`${scripts(guardedProjectId)}/${scriptId}/versions`)
        .send({ fileObjectId, currentDocumentVersion: version });
    const wrongFormat = await viaScripts(docx, before.version);
    expect(wrongFormat.status).toBe(422);
    expect(wrongFormat.body.error.code).toBe("SCRIPT_FORMAT_UNSUPPORTED");
    const added = await viaScripts(pdf, before.version);
    expect(added.status).toBe(201);
    expect(added.body.data.script.currentVersion).toMatchObject({
      lineageId: before.id,
      versionNumber: 2,
      file: { id: pdf, mediaType: "application/pdf" },
    });
  });

  it("refuses moving the script out of the Script folder, but allows harmless metadata edits", async () => {
    const before = await currentVersion();
    const auditBefore = await auditCount();
    const moved = await member.patch(`${documents()}/${before.id}`).send({
      folder: "general",
      title: "Renamed too",
      version: before.version,
    });
    expect(moved.status).toBe(409);
    expect(moved.body.error.code).toBe("DOCUMENT_BACKS_SCRIPT");
    expect(await currentVersion()).toEqual(before);
    expect(await auditCount()).toBe(auditBefore);

    const edited = await member.patch(`${documents()}/${before.id}`).send({
      title: "Guarded (Revised)",
      status: "under_review",
      notes: "Circulated to the team.",
      folder: "script",
      version: before.version,
    });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({
      folder: "script",
      title: "Guarded (Revised)",
      status: "under_review",
    });
    expect(
      (await member.get(`${scripts(guardedProjectId)}/${scriptId}`)).body.data
        .script.title,
    ).toBe("Guarded (Revised)");
    expect(await auditCount()).toBe(auditBefore + 1);
  });

  it("leaves ordinary documents' versioning and filing unchanged", async () => {
    const created = await member.post(documents()).send({
      fileObjectId: await stage(member, "Deck.pdf", v1Bytes),
      folder: "general",
      title: "Pitch deck",
    });
    expect(created.status).toBe(201);
    const versioned = await member
      .post(`${documents()}/${created.body.data.id}/versions`)
      .send({
        fileObjectId: await stage(member, "Deck.docx", docxBytes),
        version: created.body.data.version,
      });
    expect(versioned.status).toBe(201);
    expect(versioned.body.data.versionNumber).toBe(2);
    const refiled = await member
      .patch(`${documents()}/${versioned.body.data.id}`)
      .send({ folder: "script", version: versioned.body.data.version });
    expect(refiled.status).toBe(200);
    expect(refiled.body.data.folder).toBe("script");
  });

  it("once the script is removed, its lineage is an ordinary document again", async () => {
    expect(
      (await member.delete(`${scripts(guardedProjectId)}/${scriptId}`)).status,
    ).toBe(204);
    const current = (
      await member.get(`${documents()}?folder=script`)
    ).body.data.items.find(
      (document: { title: string }) => document.title === "Guarded (Revised)",
    );
    const versioned = await member
      .post(`${documents()}/${current.id}/versions`)
      .send({
        fileObjectId: await stage(member, "After.docx", docxBytes),
        version: current.version,
      });
    expect(versioned.status).toBe(201);
    const moved = await member
      .patch(`${documents()}/${versioned.body.data.id}`)
      .send({ folder: "general", version: versioned.body.data.version });
    expect(moved.status).toBe(200);
  });
});
