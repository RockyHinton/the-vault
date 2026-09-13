import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { summarizeLegalCategory } from "@shared/contracts";
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

const records = (id = projectId) => `/api/v1/projects/${id}/legal-records`;
const auditActions = async (recordId: string) =>
  (
    await context.database.client.query(
      "SELECT action, metadata FROM audit_events WHERE entity_type = 'legal_record' AND entity_id = $1 ORDER BY created_at",
      [recordId],
    )
  ).rows as { action: string; metadata: Record<string, unknown> }[];
const provisionUser = async (email: string, password: string) => {
  const response = await admin
    .post("/api/v1/users")
    .send({ email, displayName: "Stranger", password, role: "user" });
  expect(response.status).toBe(201);
  return { email, password, displayName: "Stranger" };
};
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
  projectId = (await admin.post("/api/v1/projects").send({ title: "Papered" }))
    .body.data.id;
  otherProjectId = (
    await admin.post("/api/v1/projects").send({ title: "Elsewhere" })
  ).body.data.id;
  memberId = (await member.get("/api/v1/auth/me")).body.data.user.id;
});

afterAll(async () => {
  await context.destroy();
});

describe("legal records: creation across categories", () => {
  it("creates representative records of different categories with validated details", async () => {
    const writer = await member.post(records()).send({
      name: "Ada Writer",
      details: {
        category: "writer_agreements",
        role: "Co-writer",
        email: "ada@example.com",
      },
      createdBy: { id: "spoofed" },
    });
    expect(writer.status).toBe(201);
    expect(writer.body.data).toMatchObject({
      category: "writer_agreements",
      name: "Ada Writer",
      details: {
        category: "writer_agreements",
        role: "Co-writer",
        email: "ada@example.com",
      },
      documents: [],
      createdBy: { id: memberId },
      version: 1,
    });
    const investor = await admin.post(records()).send({
      name: "Northern Fund",
      details: {
        category: "investment_agreements",
        investorType: "Fund",
        currency: "GBP",
        amount: "250000.00",
        commitment: "Soft committed",
      },
    });
    expect(investor.status).toBe(201);
    expect(investor.body.data.details.amount).toBe("250000.00");
    const list = await member.get(`${records()}?category=writer_agreements`);
    expect(list.body.data.items.map((r: { name: string }) => r.name)).toEqual([
      "Ada Writer",
    ]);
    expect((await auditActions(writer.body.data.id))[0]).toEqual({
      action: "legal_record.created",
      metadata: { projectId, category: "writer_agreements" },
    });
  });

  it("rejects details that do not match their category's schema", async () => {
    const badRole = await member.post(records()).send({
      name: "X",
      details: { category: "producers_agreements", role: "Showrunner" },
    });
    expect(badRole.status).toBe(400);
    const badAmount = await member.post(records()).send({
      name: "X",
      details: {
        category: "investment_agreements",
        investorType: "Fund",
        currency: "GBP",
        amount: "£250k",
        commitment: "Closed",
      },
    });
    expect(badAmount.status).toBe(400);
    const unknownCategory = await member
      .post(records())
      .send({ name: "X", details: { category: "insurance" } });
    expect(unknownCategory.status).toBe(400);
  });

  it("PostgreSQL refuses details whose category disagrees with the record", async () => {
    const [{ id: userId }] = (
      await context.database.client.query(
        "SELECT id FROM application_users LIMIT 1",
      )
    ).rows;
    await expect(
      context.database.client.query(
        `INSERT INTO legal_records (project_id, category, name, details, created_by_user_id)
         VALUES ($1, 'cama', 'Mismatch', '{"category":"writer_agreements"}', $2)`,
        [projectId, userId],
      ),
    ).rejects.toThrow(/legal_records_details_category_matches/);
    await expect(
      context.database.client.query(
        `INSERT INTO legal_records (project_id, category, name, details, created_by_user_id)
         VALUES ($1, 'cama', '  ', '{"category":"cama"}', $2)`,
        [projectId, userId],
      ),
    ).rejects.toThrow(/legal_records_name_not_blank/);
  });
});

describe("legal records: scoping, edits and concurrency", () => {
  it("a record is unreachable through another project's routes", async () => {
    const record = (await member.get(records())).body.data.items[0];
    expect(
      (await admin.get(`${records(otherProjectId)}/${record.id}`)).status,
    ).toBe(404);
    expect(
      (
        await admin
          .patch(`${records(otherProjectId)}/${record.id}`)
          .send({ name: "Hijacked", version: record.version })
      ).status,
    ).toBe(404);
    expect(
      (
        await admin
          .delete(`${records(otherProjectId)}/${record.id}`)
          .send({ version: record.version })
      ).status,
    ).toBe(404);
    expect((await admin.get(records(otherProjectId))).body.data.items).toEqual(
      [],
    );
  });

  it("edits with a version; the category is immutable; stale edits leave no audit", async () => {
    const writer = (await member.get(`${records()}?category=writer_agreements`))
      .body.data.items[0];
    const edited = await admin.patch(`${records()}/${writer.id}`).send({
      details: {
        category: "writer_agreements",
        role: "Rewrite",
        company: "Quill Ltd",
      },
      notes: "Rewrite engaged.",
      version: writer.version,
    });
    expect(edited.status).toBe(200);
    expect(edited.body.data.details).toEqual({
      category: "writer_agreements",
      role: "Rewrite",
      company: "Quill Ltd",
    });
    const wrongCategory = await admin.patch(`${records()}/${writer.id}`).send({
      details: { category: "cama" },
      version: writer.version + 1,
    });
    expect(wrongCategory.status).toBe(422);
    expect(wrongCategory.body.error.code).toBe("DETAILS_CATEGORY_MISMATCH");
    const stale = await admin
      .patch(`${records()}/${writer.id}`)
      .send({ name: "Stale", version: writer.version });
    expect(stale.status).toBe(409);
    expect((await auditActions(writer.id)).map((row) => row.action)).toEqual([
      "legal_record.created",
      "legal_record.updated",
    ]);
  });
});

describe("legal records: documents, status workflow and completion", () => {
  let writerId: string;
  let investorId: string;

  beforeAll(async () => {
    const items = (await member.get(records())).body.data.items as {
      id: string;
      category: string;
    }[];
    writerId = items.find((r) => r.category === "writer_agreements")!.id;
    investorId = items.find((r) => r.category === "investment_agreements")!.id;
  });

  it("uploads and attaches into the category folder; the record is pending while the document is a draft", async () => {
    const fileId = await member
      .post("/api/v1/files")
      .set("content-type", "application/octet-stream")
      .set("x-vault-filename", "Writer Agreement.pdf")
      .send(Buffer.from("%PDF-1.4\n% writer v1\n%%EOF\n"));
    const attached = await member
      .post(`${records()}/${writerId}/documents`)
      .send({ fileObjectId: fileId.body.data.id, title: "Writer Agreement" });
    expect(attached.status).toBe(201);
    expect(attached.body.data.documents[0]).toMatchObject({
      title: "Writer Agreement",
      folder: "legal/writer-agreements",
      status: "draft",
    });
    const overview = summarizeLegalCategory(
      [attached.body.data].map((r: { documents: { status: "draft" }[] }) => ({
        documentStatuses: r.documents.map((d) => d.status),
      })),
    );
    expect(overview).toMatchObject({
      total: 1,
      confirmed: 0,
      completion: "in_progress",
    });
  });

  it("document status is Documents-domain state: the uploader or an admin changes it through the Documents update, and the record's confirmation follows", async () => {
    const record = (await member.get(`${records()}/${writerId}`)).body.data;
    const [doc] = record.documents; // uploaded by the member
    // There is no legal status command; the old path must not exist.
    const noCommand = await admin
      .post(`${records()}/${writerId}/documents/${doc.id}/status`)
      .send({ status: "signed", version: doc.version });
    expect(noCommand.status).toBe(404);
    // A second ordinary user who did not upload it cannot change it.
    const stranger = await context.loginAs(
      await provisionUser(
        "stranger@vault.test",
        "Stranger-Password-2026-strong",
      ),
    );
    const forbidden = await stranger
      .patch(`/api/v1/projects/${projectId}/documents/${doc.id}`)
      .send({ status: "signed", version: doc.version });
    expect(forbidden.status).toBe(403);
    const stale = await member
      .patch(`/api/v1/projects/${projectId}/documents/${doc.id}`)
      .send({ status: "signed", version: doc.version + 3 });
    expect(stale.status).toBe(409);
    const signed = await member
      .patch(`/api/v1/projects/${projectId}/documents/${doc.id}`)
      .send({ status: "signed", version: doc.version });
    expect(signed.status).toBe(200);
    const after = (await member.get(`${records()}/${writerId}`)).body.data;
    expect(after.documents[0].status).toBe("signed");
    expect(
      summarizeLegalCategory([
        {
          documentStatuses: after.documents.map(
            (d: { status: string }) => d.status,
          ),
        },
      ]).completion,
    ).toBe("completed");
    // One audit path: the Documents event only; the legal record has no status event.
    const documentEvents = await context.database.client.query(
      "SELECT action, metadata FROM audit_events WHERE entity_type = 'document' AND entity_id = $1 ORDER BY created_at",
      [doc.id],
    );
    expect(documentEvents.rows).toEqual([
      expect.objectContaining({ action: "document.created" }),
      expect.objectContaining({
        action: "document.updated",
        metadata: { projectId, changedFields: ["status"] },
      }),
    ]);
    expect(
      (await auditActions(writerId)).map((row) => row.action),
    ).not.toContain("legal_record.document_status_changed");
  });

  it("completion derives from current versions: a new draft version reopens the record", async () => {
    const before = (await member.get(`${records()}/${writerId}`)).body.data;
    expect(
      summarizeLegalCategory([
        {
          documentStatuses: before.documents.map(
            (d: { status: string }) => d.status,
          ),
        },
      ]).completion,
    ).toBe("completed");
    const [v1] = before.documents;
    const fileId = await stagePdf(
      member,
      "Writer Agreement v2.pdf",
      "writer v2",
    );
    const v2 = await member
      .post(`/api/v1/projects/${projectId}/documents/${v1.id}/versions`)
      .send({ fileObjectId: fileId, status: "draft", version: v1.version });
    expect(v2.status).toBe(201);
    const after = (await member.get(`${records()}/${writerId}`)).body.data;
    expect(after.documents).toHaveLength(1);
    expect(after.documents[0]).toMatchObject({
      id: v2.body.data.id,
      versionNumber: 2,
      status: "draft",
    });
    expect(
      summarizeLegalCategory([
        {
          documentStatuses: after.documents.map(
            (d: { status: string }) => d.status,
          ),
        },
      ]).completion,
    ).toBe("in_progress");
  });

  it("attaches an existing document and detaching is creator-or-admin, leaving the document intact", async () => {
    const fileId = await stagePdf(admin, "Term Sheet.pdf", "term sheet");
    const doc = await admin
      .post(`/api/v1/projects/${projectId}/documents`)
      .send({
        fileObjectId: fileId,
        folder: "legal/investment-agreements",
        title: "Term Sheet",
      });
    const attached = await member.put(
      `${records()}/${investorId}/documents/${doc.body.data.id}`,
    );
    expect(attached.status).toBe(200);
    expect(
      attached.body.data.documents.map((d: { title: string }) => d.title),
    ).toEqual(["Term Sheet"]);
    // The investor record was created by the admin; the member cannot detach.
    const forbidden = await member.delete(
      `${records()}/${investorId}/documents/${doc.body.data.id}`,
    );
    expect(forbidden.status).toBe(403);
    const detached = await admin.delete(
      `${records()}/${investorId}/documents/${doc.body.data.id}`,
    );
    expect(detached.status).toBe(200);
    expect(detached.body.data.documents).toEqual([]);
    expect(
      (
        await member.get(
          `/api/v1/projects/${projectId}/documents/${doc.body.data.id}`,
        )
      ).status,
    ).toBe(200);
  });

  it("deletion is creator-or-admin, soft, and keeps the library intact", async () => {
    const investor = (await admin.get(`${records()}/${investorId}`)).body.data;
    expect(
      (
        await member
          .delete(`${records()}/${investorId}`)
          .send({ version: investor.version })
      ).status,
    ).toBe(403);
    const writer = (await member.get(`${records()}/${writerId}`)).body.data;
    expect(
      (
        await member
          .delete(`${records()}/${writerId}`)
          .send({ version: writer.version })
      ).status,
    ).toBe(204);
    expect((await member.get(`${records()}/${writerId}`)).status).toBe(404);
    const library = await admin.get(
      `/api/v1/projects/${projectId}/documents?folder=legal/writer-agreements`,
    );
    expect(
      library.body.data.items.map((d: { title: string }) => d.title),
    ).toEqual(["Writer Agreement"]);
    expect((await auditActions(writerId)).map((row) => row.action).at(-1)).toBe(
      "legal_record.deleted",
    );
  });
});
