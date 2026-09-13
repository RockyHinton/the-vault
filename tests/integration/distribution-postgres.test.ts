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
let adminId: string;
let ukId: string;

const territories = (id = projectId) =>
  `/api/v1/projects/${id}/distribution/territories`;
const territory = (territoryId: string, id = projectId) =>
  `${territories(id)}/${territoryId}`;
const auditActions = async (entityType: string, entityId: string) =>
  (
    await context.database.client.query(
      "SELECT action, metadata FROM audit_events WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at",
      [entityType, entityId],
    )
  ).rows as { action: string; metadata: Record<string, unknown> }[];
const stagePdf = async (agent: Agent, name: string) => {
  const response = await agent
    .post("/api/v1/files")
    .set("content-type", "application/octet-stream")
    .set("x-vault-filename", name)
    .send(Buffer.from(`%PDF-1.4\n% ${name}\n%%EOF\n`));
  expect(response.status).toBe(201);
  return response.body.data.id as string;
};

type Territory = {
  id: string;
  name: string;
  status: string;
  version: number;
  noteCount: number;
  documentCount: number;
  createdBy: { id: string };
  deal: Record<string, string | null>;
  notes: {
    id: string;
    body: string;
    version: number;
    author: { id: string };
    editedAt: string | null;
  }[];
  documents: {
    id: string;
    lineageId: string;
    versionNumber: number;
    title: string;
    folder: string;
    file: { id: string };
  }[];
};
const current = async (
  territoryId: string,
  agent: Agent = member,
): Promise<Territory> => (await agent.get(territory(territoryId))).body.data;

beforeAll(async () => {
  context = await createTestContext();
  admin = await context.loginAs(adminCredentials);
  member = await context.loginAs(memberCredentials);
  projectId = (
    await admin.post("/api/v1/projects").send({ title: "Distributed" })
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

describe("distribution: territories", () => {
  it("creates project-scoped territories with the session's creator, unique by name ignoring case, ordered by creation", async () => {
    expect((await member.get(territories())).body.data.items).toEqual([]);
    const created = await member.post(territories()).send({
      name: "  United Kingdom ",
      createdBy: { id: "spoofed" },
      status: "licensed",
    });
    expect(created.status).toBe(201);
    ukId = created.body.data.id;
    expect(created.body.data).toMatchObject({
      name: "United Kingdom",
      status: "available",
      noteCount: 0,
      documentCount: 0,
      createdBy: { id: memberId },
      version: 1,
      deal: {
        distributor: null,
        contact: null,
        signaturePayment: null,
        deliveryPayment: null,
        generalNotes: null,
      },
      notes: [],
      documents: [],
    });
    expect(created.body.data.createdBy).not.toHaveProperty("email");
    const duplicate = await admin
      .post(territories())
      .send({ name: "united kingdom" });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("TERRITORY_NAME_TAKEN");
    expect(
      (await member.post(territories()).send({ name: "   " })).status,
    ).toBe(400);
    expect(
      (await admin.post(territories()).send({ name: "France" })).status,
    ).toBe(201);
    expect(
      (
        await admin
          .post(territories(otherProjectId))
          .send({ name: "United Kingdom" })
      ).status,
    ).toBe(201);
    const list = await member.get(territories());
    expect(list.body.data.items.map((t: Territory) => t.name)).toEqual([
      "United Kingdom",
      "France",
    ]);
    expect(list.body.data.items[0]).not.toHaveProperty("notes");
    await expect(
      context.database.client.query(
        "INSERT INTO distribution_territories (project_id, name, created_by_user_id) VALUES ($1, 'UNITED KINGDOM', $2)",
        [projectId, memberId],
      ),
    ).rejects.toThrow(/distribution_territories_project_name_unique/);
    expect(
      (await auditActions("distribution_territory", ukId)).map((r) => r.action),
    ).toEqual(["distribution_territory.created"]);
  });

  it("a territory is unreachable through another project", async () => {
    expect((await admin.get(territory(ukId, otherProjectId))).status).toBe(404);
    expect(
      (
        await admin
          .patch(territory(ukId, otherProjectId))
          .send({ name: "Hijacked", version: 1 })
      ).status,
    ).toBe(404);
    expect(
      (
        await admin
          .post(`${territory(ukId, otherProjectId)}/status`)
          .send({ status: "closed", version: 1 })
      ).status,
    ).toBe(404);
    expect(
      (await admin.delete(territory(ukId, otherProjectId)).send({ version: 1 }))
        .status,
    ).toBe(404);
    expect(
      (
        await admin
          .post(`${territory(ukId, otherProjectId)}/notes`)
          .send({ body: "x" })
      ).status,
    ).toBe(404);
    expect((await current(ukId)).version).toBe(1);
  });

  it("rename and deal information are collaborative, compare-and-set, text only, and audited", async () => {
    const stale = await admin
      .patch(territory(ukId))
      .send({ distributor: "Studio Canal", version: 9 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
    expect(
      (await admin.patch(territory(ukId)).send({ version: 1 })).status,
    ).toBe(400);
    expect(
      (
        await admin
          .patch(territory(ukId))
          .send({ status: "licensed", version: 1 })
      ).status,
    ).toBe(400);
    const edited = await admin.patch(territory(ukId)).send({
      distributor: "Studio Canal",
      contact: "  Ana Sales <ana@example.com> ",
      signaturePayment: "20% on signature",
      deliveryPayment: "80% on delivery",
      generalNotes: "Exclusive theatrical, 15 years.",
      version: 1,
    });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({
      version: 2,
      deal: {
        distributor: "Studio Canal",
        contact: "Ana Sales <ana@example.com>",
        signaturePayment: "20% on signature",
        deliveryPayment: "80% on delivery",
        generalNotes: "Exclusive theatrical, 15 years.",
      },
    });
    const renamed = await member
      .patch(territory(ukId))
      .send({ name: "UK & Ireland", contact: "", version: 2 });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data).toMatchObject({
      name: "UK & Ireland",
      version: 3,
      deal: { contact: null, distributor: "Studio Canal" },
    });
    const clash = await member
      .patch(territory(ukId))
      .send({ name: "FRANCE", version: 3 });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("TERRITORY_NAME_TAKEN");
    const audit = await auditActions("distribution_territory", ukId);
    expect(audit.map((r) => r.action)).toEqual([
      "distribution_territory.created",
      "distribution_territory.updated",
      "distribution_territory.updated",
    ]);
    expect(audit[2].metadata).toMatchObject({
      fromName: "United Kingdom",
      toName: "UK & Ireland",
      changedFields: ["name", "contact"],
    });
  });

  it("status is an explicit command with constrained values and no transition rules", async () => {
    const bad = await member
      .post(`${territory(ukId)}/status`)
      .send({ status: "Licensed", version: 3 });
    expect(bad.status).toBe(400);
    const same = await member
      .post(`${territory(ukId)}/status`)
      .send({ status: "available", version: 3 });
    expect(same.status).toBe(409);
    expect(same.body.error.code).toBe("STATUS_UNCHANGED");
    const stale = await member
      .post(`${territory(ukId)}/status`)
      .send({ status: "closed", version: 2 });
    expect(stale.status).toBe(409);
    const closed = await member
      .post(`${territory(ukId)}/status`)
      .send({ status: "closed", version: 3 });
    expect(closed.status).toBe(200);
    expect(closed.body.data).toMatchObject({ status: "closed", version: 4 });
    const reopened = await admin
      .post(`${territory(ukId)}/status`)
      .send({ status: "in_discussion", version: 4 });
    expect(reopened.status).toBe(200);
    expect(
      (await auditActions("distribution_territory", ukId))
        .slice(-2)
        .map((r) => [r.action, r.metadata.from, r.metadata.to]),
    ).toEqual([
      ["distribution_territory.status_changed", "available", "closed"],
      ["distribution_territory.status_changed", "closed", "in_discussion"],
    ]);
    await expect(
      context.database.client.query(
        "UPDATE distribution_territories SET status = 'Licensed' WHERE id = $1",
        [ukId],
      ),
    ).rejects.toThrow(/invalid input value for enum/);
  });
});

describe("distribution: notes", () => {
  it("notes are authored records: anyone adds, only the author or an admin edits or deletes, newest first", async () => {
    const first = await member
      .post(`${territory(ukId)}/notes`)
      .send({ body: "Met the buyer at Cannes.", author: { id: "spoofed" } });
    expect(first.status).toBe(201);
    const second = await admin
      .post(`${territory(ukId)}/notes`)
      .send({ body: "Term sheet expected Friday." });
    expect(second.status).toBe(201);
    const data: Territory = second.body.data;
    expect(data.noteCount).toBe(2);
    expect(data.notes.map((n) => [n.body, n.author.id, n.editedAt])).toEqual([
      ["Term sheet expected Friday.", adminId, null],
      ["Met the buyer at Cannes.", memberId, null],
    ]);
    const mine = data.notes[1];
    const theirs = data.notes[0];
    const forbidden = await member
      .patch(`${territory(ukId)}/notes/${theirs.id}`)
      .send({ body: "x", version: theirs.version });
    expect(forbidden.status).toBe(403);
    const stale = await member
      .patch(`${territory(ukId)}/notes/${mine.id}`)
      .send({ body: "x", version: mine.version + 1 });
    expect(stale.status).toBe(409);
    const edited = await member
      .patch(`${territory(ukId)}/notes/${mine.id}`)
      .send({
        body: "Met the buyer at Cannes (booth 12).",
        version: mine.version,
      });
    expect(edited.status).toBe(200);
    const editedNote = edited.body.data.notes.find(
      (n: { id: string }) => n.id === mine.id,
    );
    expect(editedNote).toMatchObject({
      body: "Met the buyer at Cannes (booth 12).",
      version: mine.version + 1,
    });
    expect(editedNote.editedAt).not.toBeNull();
    expect(
      (
        await member
          .delete(`${territory(ukId)}/notes/${theirs.id}`)
          .send({ version: theirs.version })
      ).status,
    ).toBe(403);
    const removedByAdmin = await admin
      .delete(`${territory(ukId)}/notes/${mine.id}`)
      .send({ version: mine.version + 1 });
    expect(removedByAdmin.status).toBe(200);
    expect(
      removedByAdmin.body.data.notes.map((n: { id: string }) => n.id),
    ).toEqual([theirs.id]);
    expect(
      (await auditActions("distribution_territory_note", mine.id)).map(
        (r) => r.action,
      ),
    ).toEqual([
      "distribution_territory_note.created",
      "distribution_territory_note.updated",
      "distribution_territory_note.deleted",
    ]);
    expect(
      (await auditActions("distribution_territory_note", theirs.id)).map(
        (r) => r.action,
      ),
    ).toEqual(["distribution_territory_note.created"]);
    expect(
      (await member.get(territories())).body.data.items.find(
        (t: Territory) => t.id === ukId,
      ).noteCount,
    ).toBe(1);
  });
});

describe("distribution: documents", () => {
  it("upload-and-attach files into the distribution folder, follows versions, detaches creator-or-admin, keeps bytes private", async () => {
    const fileId = await stagePdf(admin, "UK Distribution Agreement.pdf");
    const attached = await admin.post(`${territory(ukId)}/documents`).send({
      fileObjectId: fileId,
      title: "UK Distribution Agreement",
      status: "draft",
      notes: "Long form",
    });
    expect(attached.status).toBe(201);
    const document = attached.body.data.documents[0];
    expect(document).toMatchObject({
      folder: "distribution",
      title: "UK Distribution Agreement",
      versionNumber: 1,
    });
    expect(attached.body.data.documentCount).toBe(1);
    expect(
      (await admin.put(`${territory(ukId)}/documents/${document.id}`)).status,
    ).toBe(409);

    // A new version through the Documents domain stays attached and resolves to the current version.
    const newFile = await stagePdf(admin, "UK Distribution Agreement v2.pdf");
    const versioned = await admin
      .post(`/api/v1/projects/${projectId}/documents/${document.id}/versions`)
      .send({ fileObjectId: newFile, version: document.version });
    expect(versioned.status).toBe(201);
    const refreshed = await current(ukId);
    expect(refreshed.documents).toHaveLength(1);
    expect(refreshed.documents[0]).toMatchObject({
      lineageId: document.lineageId,
      versionNumber: 2,
    });

    // Bytes need a session; with one they stream.
    const anonymous = await context.newApp();
    const request = (await import("supertest")).default;
    expect(
      (
        await request(anonymous).get(
          `/api/v1/files/${refreshed.documents[0].file.id}/content`,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await member.get(
          `/api/v1/files/${refreshed.documents[0].file.id}/content`,
        )
      ).status,
    ).toBe(200);

    // Detach is creator-or-admin: the member created this territory, so they may.
    const byCreator = await member.delete(
      `${territory(ukId)}/documents/${refreshed.documents[0].id}`,
    );
    expect(byCreator.status).toBe(200);
    expect(byCreator.body.data.documents).toEqual([]);
    const reattached = await admin.put(
      `${territory(ukId)}/documents/${refreshed.documents[0].id}`,
    );
    expect(reattached.status).toBe(200);
    const franceId = (await member.get(territories())).body.data.items.find(
      (t: Territory) => t.name === "France",
    ).id;
    const memberAttach = await member
      .post(`${territory(franceId)}/documents`)
      .send({
        fileObjectId: await stagePdf(member, "fr.pdf"),
        title: "France LOI",
        status: "draft",
      });
    expect(memberAttach.status).toBe(201);
    const frDoc = memberAttach.body.data.documents[0];
    const notCreator = await member.delete(
      `${territory(franceId)}/documents/${frDoc.id}`,
    );
    expect(notCreator.status).toBe(403);
    expect(
      (await admin.delete(`${territory(franceId)}/documents/${frDoc.id}`))
        .status,
    ).toBe(200);
    expect(
      (await member.get(`/api/v1/projects/${projectId}/documents/${frDoc.id}`))
        .status,
    ).toBe(200);
    expect(
      (await auditActions("distribution_territory", franceId))
        .slice(-2)
        .map((r) => r.action),
    ).toEqual([
      "distribution_territory.document_attached",
      "distribution_territory.document_detached",
    ]);
  });
});

describe("distribution: removal", () => {
  it("deleting a territory is creator-or-admin, versioned, soft, and leaves documents in the library", async () => {
    const franceId = (await member.get(territories())).body.data.items.find(
      (t: Territory) => t.name === "France",
    ).id;
    const franceVersion = (await current(franceId)).version;
    const forbidden = await member
      .delete(territory(franceId))
      .send({ version: franceVersion });
    expect(forbidden.status).toBe(403);
    const stale = await admin
      .delete(territory(franceId))
      .send({ version: franceVersion + 1 });
    expect(stale.status).toBe(409);
    expect(
      (await auditActions("distribution_territory", franceId)).some(
        (r) => r.action === "distribution_territory.deleted",
      ),
    ).toBe(false);
    const removed = await admin
      .delete(territory(franceId))
      .send({ version: franceVersion });
    expect(removed.status).toBe(204);
    expect((await member.get(territory(franceId))).status).toBe(404);
    expect(
      (await member.get(territories())).body.data.items.map(
        (t: Territory) => t.name,
      ),
    ).toEqual(["UK & Ireland"]);
    const row = (
      await context.database.client.query(
        "SELECT deleted_at FROM distribution_territories WHERE id = $1",
        [franceId],
      )
    ).rows[0];
    expect(row.deleted_at).not.toBeNull();
    // The name is free again once the territory is gone.
    expect(
      (await member.post(territories()).send({ name: "France" })).status,
    ).toBe(201);
    const uk = await current(ukId);
    const ownRemoval = await member
      .delete(territory(ukId))
      .send({ version: uk.version });
    expect(ownRemoval.status).toBe(204);
    expect(
      (
        await member.get(
          `/api/v1/projects/${projectId}/documents?folder=distribution`,
        )
      ).body.data.items.length,
    ).toBeGreaterThan(0);
    expect(
      (await auditActions("distribution_territory", ukId)).at(-1),
    ).toMatchObject({
      action: "distribution_territory.deleted",
      metadata: { name: "UK & Ireland" },
    });
  });
});
