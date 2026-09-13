import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

const rights = (id = projectId) => `/api/v1/projects/${id}/rights`;
const auditActions = async (rightId: string) =>
  (
    await context.database.client.query(
      "SELECT action, metadata FROM audit_events WHERE entity_type = 'project_right' AND entity_id = $1 ORDER BY created_at",
      [rightId],
    )
  ).rows as { action: string; metadata: Record<string, unknown> }[];
const stagePdf = async (agent: Agent, name: string, marker: string) => {
  const response = await agent
    .post("/api/v1/files")
    .set("content-type", "application/octet-stream")
    .set("x-vault-filename", name)
    .send(Buffer.from(`%PDF-1.4\n% ${marker}\n%%EOF\n`));
  expect(response.status).toBe(201);
  return response.body.data.id as string;
};

beforeAll(async () => {
  context = await createTestContext();
  admin = await context.loginAs(adminCredentials);
  member = await context.loginAs(memberCredentials);
  projectId = (
    await admin.post("/api/v1/projects").send({ title: "Rights Held" })
  ).body.data.id;
  otherProjectId = (
    await admin.post("/api/v1/projects").send({ title: "Elsewhere" })
  ).body.data.id;
  memberId = (await member.get("/api/v1/auth/me")).body.data.user.id;
});

afterAll(async () => {
  await context.destroy();
});

describe("rights: creation and reads", () => {
  it("a fresh project has no rights items; nothing is seeded by reading", async () => {
    const first = await member.get(rights());
    const second = await member.get(rights());
    expect(first.body.data.items).toEqual([]);
    expect(second.body.data.items).toEqual([]);
  });

  it("any user creates an item; the status defaults to the stage's first status and the creator is the session user", async () => {
    const created = await member.post(rights()).send({
      rightsType: "book",
      rightsHolder: "Harbour Press",
      expiryDate: "2027-06-30",
      notes: "Option on the novel.",
      createdBy: { id: "spoofed" },
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      rightsType: "book",
      status: "identified",
      rightsHolder: "Harbour Press",
      expiryDate: "2027-06-30",
      documents: [],
      createdBy: { id: memberId },
      version: 1,
    });
    expect(created.body.data.createdBy).not.toHaveProperty("email");
    const again = await admin.get(`${rights()}/${created.body.data.id}`);
    expect(again.body.data).toEqual(created.body.data);
    expect((await auditActions(created.body.data.id))[0]).toEqual({
      action: "right.created",
      metadata: { projectId, rightsType: "book", status: "identified" },
    });
  });

  it("refuses a status outside the project's current stage, with no row or audit", async () => {
    const wrongStage = await member
      .post(rights())
      .send({ rightsType: "original", status: "cleared" });
    expect(wrongStage.status).toBe(422);
    expect(wrongStage.body.error.code).toBe("STATUS_NOT_ALLOWED_FOR_STAGE");
    const list = await member.get(rights());
    expect(list.body.data.items).toHaveLength(1);
    const bad = await member.post(rights()).send({ rightsType: "scroll" });
    expect(bad.status).toBe(400);
  });
});

describe("rights: scoping, edits, status and concurrency", () => {
  it("an item is unreachable through another project's routes", async () => {
    const item = (await member.get(rights())).body.data.items[0];
    expect(
      (await admin.get(`${rights(otherProjectId)}/${item.id}`)).status,
    ).toBe(404);
    expect(
      (
        await admin
          .patch(`${rights(otherProjectId)}/${item.id}`)
          .send({ notes: "x", version: item.version })
      ).status,
    ).toBe(404);
    expect(
      (
        await admin
          .post(`${rights(otherProjectId)}/${item.id}/status`)
          .send({ status: "optioned", version: item.version })
      ).status,
    ).toBe(404);
    expect(
      (
        await admin
          .delete(`${rights(otherProjectId)}/${item.id}`)
          .send({ version: item.version })
      ).status,
    ).toBe(404);
    expect((await admin.get(rights(otherProjectId))).body.data.items).toEqual(
      [],
    );
  });

  it("edits with a version; stale edits and status-through-PATCH are refused without audit", async () => {
    const item = (await member.get(rights())).body.data.items[0];
    const edited = await admin.patch(`${rights()}/${item.id}`).send({
      rightsHolder: "Harbour Press Ltd",
      expiryDate: null,
      version: item.version,
    });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({
      rightsHolder: "Harbour Press Ltd",
      expiryDate: null,
      version: item.version + 1,
    });
    const stale = await admin
      .patch(`${rights()}/${item.id}`)
      .send({ notes: "stale", version: item.version });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
    const viaPatch = await admin
      .patch(`${rights()}/${item.id}`)
      .send({ status: "optioned", version: item.version + 1 });
    expect(viaPatch.status).toBe(400);
    const actions = (await auditActions(item.id)).map((row) => row.action);
    expect(actions).toEqual(["right.created", "right.updated"]);
  });

  it("moves status through the command within the stage vocabulary and records from/to", async () => {
    const item = (await member.get(rights())).body.data.items[0];
    const stale = await member
      .post(`${rights()}/${item.id}/status`)
      .send({ status: "optioned", version: item.version + 5 });
    expect(stale.status).toBe(409);
    const outOfStage = await member
      .post(`${rights()}/${item.id}/status`)
      .send({ status: "purchased", version: item.version });
    expect(outOfStage.status).toBe(422);
    const moved = await member
      .post(`${rights()}/${item.id}/status`)
      .send({ status: "optioned", version: item.version });
    expect(moved.status).toBe(200);
    expect(moved.body.data.status).toBe("optioned");
    const same = await member
      .post(`${rights()}/${item.id}/status`)
      .send({ status: "optioned", version: item.version + 1 });
    expect(same.status).toBe(409);
    expect(same.body.error.code).toBe("STATUS_UNCHANGED");
    const events = (await auditActions(item.id)).filter(
      (row) => row.action === "right.status_changed",
    );
    expect(events.map((row) => row.metadata)).toEqual([
      { projectId, stage: "evaluation", from: "identified", to: "optioned" },
    ]);
  });

  it("after the project moves to development, the development vocabulary applies and the old status stays readable", async () => {
    const project = (await admin.get(`/api/v1/projects/${projectId}`)).body
      .data;
    const transition = await admin
      .post(`/api/v1/projects/${projectId}/stage-transitions`)
      .send({ toStage: "development", version: project.version });
    expect(transition.status).toBe(200);
    const item = (await member.get(rights())).body.data.items[0];
    expect(item.status).toBe("optioned");
    const evaluationOnly = await member
      .post(`${rights()}/${item.id}/status`)
      .send({ status: "contacted", version: item.version });
    expect(evaluationOnly.status).toBe(422);
    const purchased = await member
      .post(`${rights()}/${item.id}/status`)
      .send({ status: "purchased", version: item.version });
    expect(purchased.status).toBe(200);
  });
});

describe("rights: documents", () => {
  let rightId: string;

  beforeAll(async () => {
    rightId = (await member.get(rights())).body.data.items[0].id;
  });

  it("uploads and attaches into the underlying-rights folder in one command", async () => {
    const fileId = await stagePdf(member, "Option Agreement.pdf", "option v1");
    const attached = await member
      .post(`${rights()}/${rightId}/documents`)
      .send({ fileObjectId: fileId, title: "Option Agreement" });
    expect(attached.status).toBe(201);
    expect(attached.body.data.documents).toHaveLength(1);
    expect(attached.body.data.documents[0]).toMatchObject({
      title: "Option Agreement",
      folder: "underlying-rights",
      versionNumber: 1,
      createdBy: { id: memberId },
    });
    expect(attached.body.data.documents[0]).not.toHaveProperty("storageKey");
    const library = await admin.get(
      `/api/v1/projects/${projectId}/documents?folder=underlying-rights`,
    );
    expect(library.body.data.items).toHaveLength(1);
    expect((await auditActions(rightId)).map((row) => row.action).at(-1)).toBe(
      "right.document_attached",
    );
  });

  it("a new document version stays attached and reads resolve the current version", async () => {
    const [v1] = (await member.get(`${rights()}/${rightId}`)).body.data
      .documents;
    const fileId = await stagePdf(
      admin,
      "Option Agreement v2.pdf",
      "option v2",
    );
    const v2 = await admin
      .post(`/api/v1/projects/${projectId}/documents/${v1.id}/versions`)
      .send({ fileObjectId: fileId, status: "signed", version: v1.version });
    expect(v2.status).toBe(201);
    const after = (await member.get(`${rights()}/${rightId}`)).body.data;
    expect(after.documents).toHaveLength(1);
    expect(after.documents[0]).toMatchObject({
      id: v2.body.data.id,
      lineageId: v1.lineageId,
      versionNumber: 2,
      status: "signed",
    });
  });

  it("attaches an existing document once and refuses one from another project", async () => {
    const fileId = await stagePdf(admin, "Chain Summary.pdf", "chain");
    const doc = await admin
      .post(`/api/v1/projects/${projectId}/documents`)
      .send({
        fileObjectId: fileId,
        folder: "legal/chain-of-title",
        title: "Chain Summary",
      });
    const attached = await member.put(
      `${rights()}/${rightId}/documents/${doc.body.data.id}`,
    );
    expect(attached.status).toBe(200);
    expect(
      attached.body.data.documents.map((d: { title: string }) => d.title),
    ).toEqual(["Option Agreement", "Chain Summary"]);
    expect(
      (await member.put(`${rights()}/${rightId}/documents/${doc.body.data.id}`))
        .status,
    ).toBe(409);
    const otherFile = await stagePdf(admin, "Other.pdf", "other project");
    const otherDoc = await admin
      .post(`/api/v1/projects/${otherProjectId}/documents`)
      .send({ fileObjectId: otherFile, folder: "general", title: "Other" });
    expect(
      (
        await admin.put(
          `${rights()}/${rightId}/documents/${otherDoc.body.data.id}`,
        )
      ).status,
    ).toBe(404);
  });

  it("detaching is creator-or-admin and leaves the document intact; the member cannot detach the admin's item", async () => {
    const summary = (
      await admin.get(`${rights()}/${rightId}`)
    ).body.data.documents.find(
      (d: { title: string }) => d.title === "Chain Summary",
    );
    const detached = await admin.delete(
      `${rights()}/${rightId}/documents/${summary.id}`,
    );
    expect(detached.status).toBe(200);
    expect(detached.body.data.documents).toHaveLength(1);
    expect(
      (
        await member.get(
          `/api/v1/projects/${projectId}/documents/${summary.id}`,
        )
      ).status,
    ).toBe(200);
    expect(
      (await member.get(`/api/v1/files/${summary.file.id}/content`)).status,
    ).toBe(200);

    const adminItem = await admin
      .post(rights())
      .send({ rightsType: "life_rights" });
    const fileId = await stagePdf(member, "Release.pdf", "release");
    const attached = await member
      .post(`${rights()}/${adminItem.body.data.id}/documents`)
      .send({ fileObjectId: fileId, title: "Release" });
    expect(attached.status).toBe(201);
    const forbidden = await member.delete(
      `${rights()}/${adminItem.body.data.id}/documents/${attached.body.data.documents[0].id}`,
    );
    expect(forbidden.status).toBe(403);
  });
});

describe("rights: deletion", () => {
  it("only the creator or an admin deletes; the row is soft-deleted and documents survive", async () => {
    const items = (await member.get(rights())).body.data.items as {
      id: string;
      version: number;
      createdBy: { id: string };
    }[];
    const adminItem = items.find((item) => item.createdBy.id !== memberId)!;
    const memberItem = items.find((item) => item.createdBy.id === memberId)!;
    expect(
      (
        await member
          .delete(`${rights()}/${adminItem.id}`)
          .send({ version: adminItem.version })
      ).status,
    ).toBe(403);
    expect(
      (
        await member
          .delete(`${rights()}/${memberItem.id}`)
          .send({ version: memberItem.version + 1 })
      ).status,
    ).toBe(409);
    expect(
      (
        await member
          .delete(`${rights()}/${memberItem.id}`)
          .send({ version: memberItem.version })
      ).status,
    ).toBe(204);
    expect((await member.get(`${rights()}/${memberItem.id}`)).status).toBe(404);
    const row = await context.database.client.query(
      "SELECT deleted_at FROM project_rights WHERE id = $1",
      [memberItem.id],
    );
    expect(row.rows[0].deleted_at).not.toBeNull();
    const library = await admin.get(
      `/api/v1/projects/${projectId}/documents?folder=underlying-rights`,
    );
    expect(
      library.body.data.items.map((d: { title: string }) => d.title),
    ).toContain("Option Agreement");
    expect(
      (
        await admin
          .delete(`${rights()}/${adminItem.id}`)
          .send({ version: adminItem.version })
      ).status,
    ).toBe(204);
    expect(
      (await auditActions(memberItem.id)).map((row) => row.action).at(-1),
    ).toBe("right.deleted");
  });
});
