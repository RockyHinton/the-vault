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

const auditActions = async (entityType: string, entityId: string) =>
  (
    await context.database.client.query(
      "SELECT action, metadata FROM audit_events WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at",
      [entityType, entityId],
    )
  ).rows as { action: string; metadata: Record<string, unknown> }[];

const scores = { script: 9, director: 8, cast: 8, financing: 7 };

beforeAll(async () => {
  context = await createTestContext();
  admin = await context.loginAs(adminCredentials);
  member = await context.loginAs(memberCredentials);
  const project = await admin
    .post("/api/v1/projects")
    .send({ title: "Evaluated" });
  projectId = project.body.data.id;
});

afterAll(async () => {
  await context.destroy();
});

describe("project evaluation", () => {
  it("reads as an empty version-0 profile before anyone saves it", async () => {
    const response = await member.get(
      `/api/v1/projects/${projectId}/evaluation`,
    );
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      projectId,
      writer: null,
      financeTypes: [],
      gates: { scriptApproved: false, talentAttached: false },
      version: 0,
      updatedBy: null,
    });
  });

  it("lets a studio_admin create it with version 0 and update it with the current version", async () => {
    const created = await admin
      .put(`/api/v1/projects/${projectId}/evaluation`)
      .send({
        writer: "Ada Writer",
        director: "",
        plannedBudget: "$5M",
        financeTypes: ["equity", "pre_sale"],
        gates: {
          scriptApproved: true,
          budgetApproved: false,
          financeApproved: false,
          talentAttached: false,
        },
        version: 0,
      });
    expect(created.status).toBe(200);
    expect(created.body.data).toMatchObject({
      writer: "Ada Writer",
      director: null,
      plannedBudget: "$5M",
      financeTypes: ["equity", "pre_sale"],
      version: 1,
      updatedBy: { displayName: expect.any(String) },
    });
    expect(created.body.data.updatedBy).not.toHaveProperty("email");

    const updated = await admin
      .put(`/api/v1/projects/${projectId}/evaluation`)
      .send({
        ...created.body.data,
        gates: { ...created.body.data.gates, budgetApproved: true },
        version: 1,
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.version).toBe(2);
    expect(updated.body.data.gates.budgetApproved).toBe(true);

    expect(
      (await auditActions("project_evaluation", projectId)).map(
        (row) => row.action,
      ),
    ).toEqual(["evaluation.created", "evaluation.updated"]);
    expect(
      (await auditActions("project_evaluation", projectId))[1].metadata,
    ).toEqual({
      changedFields: ["budgetApproved"],
    });
  });

  it("answers 409 for a stale version and for a second create", async () => {
    const stale = await admin
      .put(`/api/v1/projects/${projectId}/evaluation`)
      .send({
        writer: "Stale",
        director: null,
        plannedBudget: null,
        financeTypes: [],
        gates: {
          scriptApproved: false,
          budgetApproved: false,
          financeApproved: false,
          talentAttached: false,
        },
        version: 1,
      });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
    const duplicate = await admin
      .put(`/api/v1/projects/${projectId}/evaluation`)
      .send({
        writer: null,
        director: null,
        plannedBudget: null,
        financeTypes: [],
        gates: {
          scriptApproved: false,
          budgetApproved: false,
          financeApproved: false,
          talentAttached: false,
        },
        version: 0,
      });
    expect(duplicate.status).toBe(409);
    const current = await admin.get(`/api/v1/projects/${projectId}/evaluation`);
    expect(current.body.data.writer).toBe("Ada Writer");
    expect((await auditActions("project_evaluation", projectId)).length).toBe(
      2,
    );
  });

  it("refuses ordinary users, duplicate finance types, and unknown projects", async () => {
    const body = {
      writer: null,
      director: null,
      plannedBudget: null,
      financeTypes: ["grant", "grant"],
      gates: {
        scriptApproved: false,
        budgetApproved: false,
        financeApproved: false,
        talentAttached: false,
      },
      version: 2,
    };
    const forbidden = await member
      .put(`/api/v1/projects/${projectId}/evaluation`)
      .send({ ...body, financeTypes: ["grant"] });
    expect(forbidden.status).toBe(403);
    const invalid = await admin
      .put(`/api/v1/projects/${projectId}/evaluation`)
      .send(body);
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
    const missing = await admin.get(
      `/api/v1/projects/00000000-0000-4000-8000-000000000000/evaluation`,
    );
    expect(missing.status).toBe(404);
  });
});

describe("project reviews", () => {
  it("stores one review per author with a server-derived recommendation", async () => {
    const submitted = await member
      .put(`/api/v1/projects/${projectId}/reviews/mine`)
      .send({ scores, summaryNotes: "Strong script.", version: 0 });
    expect(submitted.status).toBe(200);
    expect(submitted.body.data).toMatchObject({
      scores,
      recommendation: "develop",
      summaryNotes: "Strong script.",
      version: 1,
    });
    expect(submitted.body.data.author.displayName).toBeTypeOf("string");
    expect(submitted.body.data.author).not.toHaveProperty("email");

    const again = await member
      .put(`/api/v1/projects/${projectId}/reviews/mine`)
      .send({ scores, summaryNotes: "Dup", version: 0 });
    expect(again.status).toBe(409);

    const replaced = await member
      .put(`/api/v1/projects/${projectId}/reviews/mine`)
      .send({
        scores: { script: 4, director: 4, cast: 5, financing: 3 },
        summaryNotes: "Cooled on it.",
        version: 1,
      });
    expect(replaced.status).toBe(200);
    expect(replaced.body.data).toMatchObject({
      id: submitted.body.data.id,
      recommendation: "pass",
      version: 2,
    });

    const list = await admin.get(`/api/v1/projects/${projectId}/reviews`);
    expect(list.body.data.items).toHaveLength(1);
    expect(
      (await auditActions("project_review", submitted.body.data.id)).map(
        (row) => row.action,
      ),
    ).toEqual(["review.submitted", "review.updated"]);
  });

  it("enforces the one-review-per-author pair in PostgreSQL", async () => {
    const [{ id: authorId }] = (
      await context.database.client.query(
        "SELECT author_user_id AS id FROM project_reviews WHERE project_id = $1",
        [projectId],
      )
    ).rows;
    await expect(
      context.database.client.query(
        `INSERT INTO project_reviews (project_id, author_user_id, script_score, director_score, cast_score, financing_score, recommendation, summary_notes)
         VALUES ($1, $2, 5, 5, 5, 5, 'consider', 'dup')`,
        [projectId, authorId],
      ),
    ).rejects.toThrow(/project_reviews_project_author_unique/);
    await expect(
      context.database.client.query(
        `INSERT INTO project_reviews (project_id, author_user_id, script_score, director_score, cast_score, financing_score, recommendation, summary_notes)
         VALUES ($1, gen_random_uuid(), 11, 5, 5, 5, 'consider', 'range')`,
        [projectId],
      ),
    ).rejects.toThrow(/project_reviews_scores_in_range|foreign key/);
  });

  it("rejects out-of-range scores and blank notes at the boundary", async () => {
    const response = await admin
      .put(`/api/v1/projects/${projectId}/reviews/mine`)
      .send({
        scores: { ...scores, script: 11 },
        summaryNotes: "  ",
        version: 0,
      });
    expect(response.status).toBe(400);
  });

  it("lets only the author or a studio_admin delete, with a version", async () => {
    const adminReview = await admin
      .put(`/api/v1/projects/${projectId}/reviews/mine`)
      .send({ scores, summaryNotes: "Admin view.", version: 0 });
    const adminReviewId = adminReview.body.data.id as string;
    const forbidden = await member
      .delete(`/api/v1/projects/${projectId}/reviews/${adminReviewId}`)
      .send({ version: 1 });
    expect(forbidden.status).toBe(403);

    const list = await member.get(`/api/v1/projects/${projectId}/reviews`);
    const mine = list.body.data.items.find(
      (item: { id: string }) => item.id !== adminReviewId,
    );
    const stale = await member
      .delete(`/api/v1/projects/${projectId}/reviews/${mine.id}`)
      .send({ version: mine.version + 5 });
    expect(stale.status).toBe(409);
    const deleted = await member
      .delete(`/api/v1/projects/${projectId}/reviews/${mine.id}`)
      .send({ version: mine.version });
    expect(deleted.status).toBe(204);

    const byAdmin = await admin
      .delete(`/api/v1/projects/${projectId}/reviews/${adminReviewId}`)
      .send({ version: 1 });
    expect(byAdmin.status).toBe(204);
    const after = await admin.get(`/api/v1/projects/${projectId}/reviews`);
    expect(after.body.data.items).toEqual([]);
    expect(
      (await auditActions("project_review", mine.id)).map((row) => row.action),
    ).toContain("review.deleted");
  });
});
