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

const auditActions = async (personId: string) =>
  (
    await context.database.client.query(
      "SELECT action, metadata FROM audit_events WHERE entity_type = 'project_person' AND entity_id = $1 ORDER BY created_at",
      [personId],
    )
  ).rows as { action: string; metadata: Record<string, unknown> }[];

const people = (id = projectId) => `/api/v1/projects/${id}/people`;

const stagePdf = async (agent: Agent, name: string, marker: string) => {
  const response = await agent
    .post("/api/v1/files")
    .set("content-type", "application/octet-stream")
    .set("x-vault-filename", name)
    .send(Buffer.from(`%PDF-1.4\n% ${marker}\n%%EOF\n`));
  expect(response.status).toBe(201);
  return response.body.data.id as string;
};

const producerInput = {
  kind: "producer",
  name: "Sam Producer",
  roleTitle: "Lead Producer",
  company: "Rocket Productions",
  contacts: [
    { type: "Email", value: "sam@rocket.example" },
    { type: "Phone", value: "+44 20 7946 0000" },
  ],
  links: [{ label: "IMDb", url: "https://www.imdb.com/name/nm0000001/" }],
  notes: "Primary contact.",
  status: "interested",
  engagement: { roleOnProject: "Lead Producer", contractStatus: "not_sent" },
};

beforeAll(async () => {
  context = await createTestContext();
  admin = await context.loginAs(adminCredentials);
  member = await context.loginAs(memberCredentials);
  projectId = (await admin.post("/api/v1/projects").send({ title: "Peopled" }))
    .body.data.id;
  otherProjectId = (
    await admin.post("/api/v1/projects").send({ title: "Elsewhere" })
  ).body.data.id;
  memberId = (await member.get("/api/v1/auth/me")).body.data.user.id;
});

afterAll(async () => {
  await context.destroy();
});

describe("people: create and read", () => {
  it("an ordinary user creates a producer; the creator comes from the session", async () => {
    const created = await member
      .post(people())
      .send({ ...producerInput, createdBy: { id: "spoofed" } });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      kind: "producer",
      name: "Sam Producer",
      roleTitle: "Lead Producer",
      company: "Rocket Productions",
      creativeRoleType: null,
      agent: null,
      contacts: producerInput.contacts,
      links: producerInput.links,
      engagement: {
        status: "interested",
        roleOnProject: "Lead Producer",
        startDate: null,
        contractStatus: "not_sent",
        notes: null,
      },
      documents: [],
      createdBy: { id: memberId },
      version: 1,
    });
    expect(created.body.data.createdBy).not.toHaveProperty("email");
    expect(await auditActions(created.body.data.id)).toEqual([
      {
        action: "person.created",
        metadata: { projectId, kind: "producer", status: "interested" },
      },
    ]);
  });

  it("creates a creative with a role type and agent, persisted across reads", async () => {
    const created = await admin.post(people()).send({
      kind: "creative",
      name: "Dana Director",
      roleTitle: "Director",
      creativeRoleType: "director",
      agent: "CAA",
      contacts: [{ type: "Agent Email", value: "agent@caa.example" }],
      engagement: { startDate: "2026-11-01" },
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      kind: "creative",
      creativeRoleType: "director",
      agent: "CAA",
      company: null,
      engagement: { status: null, startDate: "2026-11-01" },
    });
    const again = await member.get(`${people()}/${created.body.data.id}`);
    expect(again.body.data).toEqual(created.body.data);
    const list = await member.get(`${people()}?kind=creative`);
    expect(list.body.data.items.map((p: { name: string }) => p.name)).toEqual([
      "Dana Director",
    ]);
  });

  it("rejects invalid input at the boundary and by kind", async () => {
    const badEmail = await member.post(people()).send({
      ...producerInput,
      contacts: [{ type: "Email", value: "not-an-email" }],
    });
    expect(badEmail.status).toBe(400);
    const badLink = await member.post(people()).send({
      ...producerInput,
      links: [{ label: "x", url: "javascript:alert(1)" }],
    });
    expect(badLink.status).toBe(400);
    const badStatus = await member
      .post(people())
      .send({ ...producerInput, status: "hired" });
    expect(badStatus.status).toBe(400);
    const noCompany = await member
      .post(people())
      .send({ ...producerInput, company: undefined });
    expect(noCompany.status).toBe(400);
    const creativeNoRole = await member.post(people()).send({
      kind: "creative",
      name: "Nobody",
      roleTitle: "Grip",
    });
    expect(creativeNoRole.status).toBe(400);
  });

  it("PostgreSQL enforces the kind-specific columns", async () => {
    const [{ id: userId }] = (
      await context.database.client.query(
        "SELECT id FROM application_users LIMIT 1",
      )
    ).rows;
    await expect(
      context.database.client.query(
        `INSERT INTO project_people (project_id, kind, name, role_title, created_by_user_id)
         VALUES ($1, 'producer', 'No Company', 'EP', $2)`,
        [projectId, userId],
      ),
    ).rejects.toThrow(/project_people_producer_has_company/);
    await expect(
      context.database.client.query(
        `INSERT INTO project_people (project_id, kind, name, role_title, created_by_user_id)
         VALUES ($1, 'creative', 'No Role Type', 'DP', $2)`,
        [projectId, userId],
      ),
    ).rejects.toThrow(/project_people_creative_role_type_matches_kind/);
  });
});

describe("people: project scoping", () => {
  it("a person id is unreachable through another project's routes", async () => {
    const list = await admin.get(people());
    const person = list.body.data.items[0];
    expect(person).toBeDefined();
    const viaOther = await admin.get(`${people(otherProjectId)}/${person.id}`);
    expect(viaOther.status).toBe(404);
    const patchViaOther = await admin
      .patch(`${people(otherProjectId)}/${person.id}`)
      .send({ name: "Hijacked", version: person.version });
    expect(patchViaOther.status).toBe(404);
    const statusViaOther = await admin
      .post(`${people(otherProjectId)}/${person.id}/status`)
      .send({ status: "contracted", version: person.version });
    expect(statusViaOther.status).toBe(404);
    const deleteViaOther = await admin
      .delete(`${people(otherProjectId)}/${person.id}`)
      .send({ version: person.version });
    expect(deleteViaOther.status).toBe(404);
    const unchanged = await admin.get(`${people()}/${person.id}`);
    expect(unchanged.body.data.name).toBe(person.name);
    const otherList = await admin.get(people(otherProjectId));
    expect(otherList.body.data.items).toEqual([]);
  });
});

describe("people: update, status and concurrency", () => {
  it("edits profile fields with a version; stale edits are refused without audit", async () => {
    const list = await member.get(`${people()}?kind=producer`);
    const producer = list.body.data.items[0];
    const edited = await admin.patch(`${people()}/${producer.id}`).send({
      company: "Rocket Productions Ltd",
      engagement: { contractStatus: "sent", notes: "Deal memo drafted." },
      version: producer.version,
    });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({
      company: "Rocket Productions Ltd",
      engagement: {
        contractStatus: "sent",
        notes: "Deal memo drafted.",
        status: "interested",
      },
      version: producer.version + 1,
    });
    const stale = await admin
      .patch(`${people()}/${producer.id}`)
      .send({ name: "Stale", version: producer.version });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
    const wrongKind = await admin
      .patch(`${people()}/${producer.id}`)
      .send({ creativeRoleType: "cast", version: producer.version + 1 });
    expect(wrongKind.status).toBe(422);
    const patchStatus = await admin
      .patch(`${people()}/${producer.id}`)
      .send({ status: "contracted", version: producer.version + 1 });
    expect(patchStatus.status).toBe(400);
    const actions = (await auditActions(producer.id)).map((row) => row.action);
    expect(actions).toEqual(["person.created", "person.updated"]);
    expect((await auditActions(producer.id))[1].metadata).toEqual({
      projectId,
      changedFields: ["company", "contractStatus", "engagementNotes"],
    });
  });

  it("changes engagement status through the command with from/to audit", async () => {
    const producer = (await member.get(`${people()}?kind=producer`)).body.data
      .items[0];
    const stale = await member
      .post(`${people()}/${producer.id}/status`)
      .send({ status: "offered", version: producer.version + 9 });
    expect(stale.status).toBe(409);
    const changed = await member
      .post(`${people()}/${producer.id}/status`)
      .send({ status: "offered", version: producer.version });
    expect(changed.status).toBe(200);
    expect(changed.body.data.engagement.status).toBe("offered");
    expect(changed.body.data.version).toBe(producer.version + 1);
    const same = await member
      .post(`${people()}/${producer.id}/status`)
      .send({ status: "offered", version: producer.version + 1 });
    expect(same.status).toBe(409);
    expect(same.body.error.code).toBe("STATUS_UNCHANGED");
    const cleared = await member
      .post(`${people()}/${producer.id}/status`)
      .send({ status: null, version: producer.version + 1 });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.engagement.status).toBeNull();
    const statusEvents = (await auditActions(producer.id)).filter(
      (row) => row.action === "person.status_changed",
    );
    expect(statusEvents.map((row) => row.metadata)).toEqual([
      { projectId, from: "interested", to: "offered" },
      { projectId, from: "offered", to: null },
    ]);
  });
});

describe("people: documents", () => {
  let producerId: string;
  let producerVersion: number;

  beforeAll(async () => {
    const producer = (await member.get(`${people()}?kind=producer`)).body.data
      .items[0];
    producerId = producer.id;
    producerVersion = producer.version;
  });

  it("uploads and attaches a new document in one command; the document lives in the kind folder", async () => {
    const fileId = await stagePdf(member, "Deal Memo.pdf", "deal memo v1");
    const attached = await member
      .post(`${people()}/${producerId}/documents`)
      .send({ fileObjectId: fileId, title: "Deal Memo", status: "draft" });
    expect(attached.status).toBe(201);
    expect(attached.body.data.documents).toHaveLength(1);
    const [document] = attached.body.data.documents;
    expect(document).toMatchObject({
      title: "Deal Memo",
      folder: "producers",
      versionNumber: 1,
      file: { originalFilename: "Deal Memo.pdf" },
      createdBy: { id: memberId },
    });
    expect(document).not.toHaveProperty("storageKey");
    const library = await admin.get(
      `/api/v1/projects/${projectId}/documents?folder=producers`,
    );
    expect(library.body.data.items.map((d: { id: string }) => d.id)).toEqual([
      document.id,
    ]);
    const actions = (await auditActions(producerId)).map((row) => row.action);
    expect(actions.at(-1)).toBe("person.document_attached");
    // Attaching leaves the person's own version alone: it is a link, not a profile edit.
    expect(attached.body.data.version).toBe(producerVersion);
  });

  it("a claimed or foreign file cannot be attached, and the failure leaves no row", async () => {
    const [{ id: fileId }] = (
      await context.database.client.query(
        "SELECT id FROM file_objects WHERE status = 'available' LIMIT 1",
      )
    ).rows;
    const reused = await member
      .post(`${people()}/${producerId}/documents`)
      .send({ fileObjectId: fileId, title: "Again" });
    expect(reused.status).toBe(422);
    const adminStaged = await stagePdf(admin, "Private.pdf", "admin staged");
    const foreign = await member
      .post(`${people()}/${producerId}/documents`)
      .send({ fileObjectId: adminStaged, title: "Not mine" });
    expect(foreign.status).toBe(422);
    const links = await context.database.client.query(
      "SELECT count(*)::int AS n FROM project_person_documents WHERE person_id = $1",
      [producerId],
    );
    expect(links.rows[0].n).toBe(1);
  });

  it("a new document version stays attached and reads resolve the current version", async () => {
    const person = (await member.get(`${people()}/${producerId}`)).body.data;
    const [v1] = person.documents;
    const fileId = await stagePdf(member, "Deal Memo v2.pdf", "deal memo v2");
    const v2 = await member
      .post(`/api/v1/projects/${projectId}/documents/${v1.id}/versions`)
      .send({ fileObjectId: fileId, status: "signed", version: v1.version });
    expect(v2.status).toBe(201);
    const after = (await admin.get(`${people()}/${producerId}`)).body.data;
    expect(after.documents).toHaveLength(1);
    expect(after.documents[0]).toMatchObject({
      id: v2.body.data.id,
      lineageId: v1.lineageId,
      versionNumber: 2,
      status: "signed",
    });
    const lineage = await admin.get(
      `/api/v1/projects/${projectId}/documents/${v1.id}`,
    );
    expect(lineage.body.data.versions).toHaveLength(2);
  });

  it("attaches an existing document by any version id, once", async () => {
    const fileId = await stagePdf(admin, "NDA.pdf", "nda");
    const nda = await admin
      .post(`/api/v1/projects/${projectId}/documents`)
      .send({ fileObjectId: fileId, folder: "legal/cama", title: "NDA" });
    const attached = await member.put(
      `${people()}/${producerId}/documents/${nda.body.data.id}`,
    );
    expect(attached.status).toBe(200);
    expect(
      attached.body.data.documents.map((d: { title: string }) => d.title),
    ).toEqual(["Deal Memo", "NDA"]);
    const twice = await member.put(
      `${people()}/${producerId}/documents/${nda.body.data.id}`,
    );
    expect(twice.status).toBe(409);
    const otherProjectDoc = await admin.put(
      `${people(otherProjectId)}/${producerId}/documents/${nda.body.data.id}`,
    );
    expect(otherProjectDoc.status).toBe(404);
  });

  it("detaching is creator-or-admin and leaves the document and its bytes intact", async () => {
    const person = (await admin.get(`${people()}/${producerId}`)).body.data;
    const nda = person.documents.find(
      (d: { title: string }) => d.title === "NDA",
    );
    // The producer was created by the member; the admin may still detach.
    const detached = await admin.delete(
      `${people()}/${producerId}/documents/${nda.id}`,
    );
    expect(detached.status).toBe(200);
    expect(
      detached.body.data.documents.map((d: { title: string }) => d.title),
    ).toEqual(["Deal Memo"]);
    const stillThere = await member.get(
      `/api/v1/projects/${projectId}/documents/${nda.id}`,
    );
    expect(stillThere.status).toBe(200);
    const bytes = await member.get(`/api/v1/files/${nda.file.id}/content`);
    expect(bytes.status).toBe(200);
    expect((await auditActions(producerId)).map((row) => row.action)).toContain(
      "person.document_detached",
    );
  });

  it("a second user who did not create the person cannot detach", async () => {
    const creative = (await member.get(`${people()}?kind=creative`)).body.data
      .items[0]; // created by admin
    const fileId = await stagePdf(member, "Headshot.pdf", "headshot");
    const attached = await member
      .post(`${people()}/${creative.id}/documents`)
      .send({ fileObjectId: fileId, title: "Headshot" });
    expect(attached.status).toBe(201);
    const [doc] = attached.body.data.documents;
    const forbidden = await member.delete(
      `${people()}/${creative.id}/documents/${doc.id}`,
    );
    expect(forbidden.status).toBe(403);
  });
});

describe("people: deletion", () => {
  it("only the creator or an admin deletes; the row is soft-deleted and documents survive", async () => {
    const creative = (await member.get(`${people()}?kind=creative`)).body.data
      .items[0]; // created by admin
    const forbidden = await member
      .delete(`${people()}/${creative.id}`)
      .send({ version: creative.version });
    expect(forbidden.status).toBe(403);
    const producer = (await member.get(`${people()}?kind=producer`)).body.data
      .items[0]; // created by member
    const stale = await member
      .delete(`${people()}/${producer.id}`)
      .send({ version: producer.version + 1 });
    expect(stale.status).toBe(409);
    const deleted = await member
      .delete(`${people()}/${producer.id}`)
      .send({ version: producer.version });
    expect(deleted.status).toBe(204);
    const gone = await member.get(`${people()}/${producer.id}`);
    expect(gone.status).toBe(404);
    const row = await context.database.client.query(
      "SELECT deleted_at FROM project_people WHERE id = $1",
      [producer.id],
    );
    expect(row.rows[0].deleted_at).not.toBeNull();
    const library = await admin.get(
      `/api/v1/projects/${projectId}/documents?folder=producers`,
    );
    expect(
      library.body.data.items.map((d: { title: string }) => d.title),
    ).toEqual(["Deal Memo"]);
    const byAdmin = await admin
      .delete(`${people()}/${creative.id}`)
      .send({ version: creative.version });
    expect(byAdmin.status).toBe(204);
    expect(
      (await auditActions(producer.id)).map((row) => row.action).at(-1),
    ).toBe("person.deleted");
  });
});
