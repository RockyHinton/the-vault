import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withLiveProjectTransaction } from "../../server/modules/projects/live-project";
import { openClient, waitForLockWaiters } from "../support/lock-waiters";
import {
  adminCredentials,
  createTestContext,
  memberCredentials,
  type TestContext,
} from "../support/test-context";

/**
 * A soft-deleted project is gone for writes: no project-owned command may
 * create, change, move, delete, attach or detach anything in it. Archive is a
 * lifecycle stage of a live project and is not deletion.
 */

type Agent = Awaited<ReturnType<TestContext["loginAs"]>>;

let context: TestContext;
let admin: Agent;
let member: Agent;
let watcher: Client;

const count = async (sql: string, params: unknown[] = []) =>
  (await context.database.client.query(sql, params)).rows[0].n as number;

const stagePdf = async (name: string) => {
  const response = await member
    .post("/api/v1/files")
    .set("content-type", "application/octet-stream")
    .set("x-vault-filename", name)
    .send(Buffer.from(`%PDF-1.4\n% ${name} ${randomUUID()}\n%%EOF\n`));
  expect(response.status).toBe(201);
  return response.body.data.id as string;
};

const producer = {
  kind: "producer",
  name: "Pat Producer",
  roleTitle: "Producer",
  company: "Late Films",
  contacts: [],
  links: [],
  status: "interested",
  engagement: {},
};

const createProject = async (title: string) => {
  const created = await admin.post("/api/v1/projects").send({ title });
  expect(created.status).toBe(201);
  return created.body.data as { id: string; version: number };
};

beforeAll(async () => {
  context = await createTestContext();
  admin = await context.loginAs(adminCredentials);
  member = await context.loginAs(memberCredentials);
  watcher = await openClient(context.database.databaseUrl);
});

afterAll(async () => {
  await watcher?.end();
  await context?.destroy();
});

describe("soft-deleted project: project-owned writes are refused", () => {
  it("refuses create, update, status, delete, attach and detach across domains with 404 PROJECT_NOT_FOUND and no side effects", async () => {
    const project = await createProject("Deleted");
    const base = `/api/v1/projects/${project.id}`;
    const person = (await member.post(`${base}/people`).send(producer)).body
      .data;
    const task = (await member.post(`${base}/tasks`).send({ title: "Call" }))
      .body.data;
    const right = (
      await member.post(`${base}/rights`).send({ rightsType: "original" })
    ).body.data;
    const attached = (
      await member.post(`${base}/documents`).send({
        fileObjectId: await stagePdf("Attached.pdf"),
        folder: "producers",
        title: "Attached",
      })
    ).body.data;
    const loose = (
      await member.post(`${base}/documents`).send({
        fileObjectId: await stagePdf("Loose.pdf"),
        folder: "general",
        title: "Loose",
      })
    ).body.data;
    expect(
      (await member.put(`${base}/people/${person.id}/documents/${attached.id}`))
        .status,
    ).toBe(200);
    const budget = (
      await member.post(`${base}/budget`).send({ currency: "USD" })
    ).body.data;
    const department = budget.currentVersion.departments[0];
    const territory = (
      await member
        .post(`${base}/distribution/territories`)
        .send({ name: "Japan" })
    ).body.data;
    const personVersion = (await member.get(`${base}/people/${person.id}`)).body
      .data.version;

    const liveVersion = (await admin.get(base)).body.data.version;
    expect(
      (await admin.delete(base).send({ version: liveVersion })).status,
    ).toBe(204);

    const lateFile = await stagePdf("Late.pdf");
    const auditBefore = await count(
      "SELECT count(*)::int AS n FROM audit_events",
    );
    const attempts = {
      "people create": () => member.post(`${base}/people`).send(producer),
      "people update": () =>
        member
          .patch(`${base}/people/${person.id}`)
          .send({ name: "Renamed", version: personVersion }),
      "people status": () =>
        member
          .post(`${base}/people/${person.id}/status`)
          .send({ status: "offered", version: personVersion }),
      "people delete": () =>
        member
          .delete(`${base}/people/${person.id}`)
          .send({ version: personVersion }),
      "people attach new": () =>
        member
          .post(`${base}/people/${person.id}/documents`)
          .send({ fileObjectId: lateFile, title: "Late" }),
      "people attach existing": () =>
        member.put(`${base}/people/${person.id}/documents/${loose.id}`),
      "people detach": () =>
        member.delete(`${base}/people/${person.id}/documents/${attached.id}`),
      "tasks create": () =>
        member.post(`${base}/tasks`).send({ title: "Late" }),
      "tasks complete": () =>
        member
          .post(`${base}/tasks/${task.id}/complete`)
          .send({ version: task.version }),
      "notes create": () =>
        member.post(`${base}/notes`).send({ body: "Late", category: "other" }),
      "rights update": () =>
        member
          .patch(`${base}/rights/${right.id}`)
          .send({ notes: "Late", version: right.version }),
      "documents update": () =>
        member
          .patch(`${base}/documents/${loose.id}`)
          .send({ title: "Late", version: loose.version }),
      "documents add version": () =>
        member
          .post(`${base}/documents/${loose.id}/versions`)
          .send({ fileObjectId: lateFile, version: loose.version }),
      "documents delete": () =>
        member
          .delete(`${base}/documents/${loose.id}`)
          .send({ version: loose.version }),
      "budget line item create": () =>
        member
          .post(`${base}/budget/departments/${department.id}/line-items`)
          .send({ name: "Late", amount: "1.00" }),
      "budget department delete": () =>
        member
          .delete(`${base}/budget/departments/${department.id}`)
          .send({ version: department.version }),
      "distribution territory update": () =>
        member
          .patch(`${base}/distribution/territories/${territory.id}`)
          .send({ distributor: "Late", version: territory.version }),
    };
    for (const [label, attempt] of Object.entries(attempts)) {
      const response = await attempt();
      expect(response.status, label).toBe(404);
      expect(response.body.error.code, label).toBe("PROJECT_NOT_FOUND");
    }

    expect(await count("SELECT count(*)::int AS n FROM audit_events")).toBe(
      auditBefore,
    );
    expect(
      await count(
        "SELECT count(*)::int AS n FROM file_objects WHERE id = $1 AND status = 'staged'",
        [lateFile],
      ),
      "the staged file was not claimed",
    ).toBe(1);
    expect(
      await count(
        "SELECT count(*)::int AS n FROM project_people WHERE project_id = $1",
        [project.id],
      ),
    ).toBe(1);
    expect(
      await count(
        "SELECT count(*)::int AS n FROM project_people WHERE id = $1 AND version = $2 AND deleted_at IS NULL",
        [person.id, personVersion],
      ),
    ).toBe(1);
    expect(
      await count(
        "SELECT count(*)::int AS n FROM project_person_documents WHERE person_id = $1",
        [person.id],
      ),
      "the attachment was neither added nor removed",
    ).toBe(1);
    expect(
      await count(
        "SELECT count(*)::int AS n FROM project_tasks WHERE project_id = $1 AND status = 'open'",
        [project.id],
      ),
    ).toBe(1);
    expect(
      await count(
        "SELECT count(*)::int AS n FROM documents WHERE project_id = $1 AND deleted_at IS NULL",
        [project.id],
      ),
    ).toBe(2);
    expect(
      await count(
        "SELECT count(*)::int AS n FROM budget_departments WHERE id = $1",
        [department.id],
      ),
    ).toBe(1);
  });

  it("an archived project is live: child commands still succeed", async () => {
    const project = await createProject("Archived");
    const base = `/api/v1/projects/${project.id}`;
    const archived = await admin.post(`${base}/archive`).send({
      reason: "paused_strategic_timing",
      revisit: "maybe",
      starred: false,
      version: project.version,
    });
    expect(archived.status).toBe(200);
    expect(archived.body.data.archivedAt).not.toBeNull();

    expect(
      (
        await member
          .post(`${base}/notes`)
          .send({ body: "Still here", category: "other" })
      ).status,
    ).toBe(201);
    const task = await member.post(`${base}/tasks`).send({ title: "Revisit" });
    expect(task.status).toBe(201);
    expect(
      (
        await member
          .post(`${base}/tasks/${task.body.data.id}/complete`)
          .send({ version: task.body.data.version })
      ).status,
    ).toBe(200);
    expect((await member.post(`${base}/people`).send(producer)).status).toBe(
      201,
    );
  });

  it("a project delete waits for an in-flight project-owned command; later commands see the deletion", async () => {
    const project = await createProject("Racing delete");
    let deletion: Promise<{ status: number }> | undefined;
    await withLiveProjectTransaction(context.db, project.id, async () => {
      deletion = Promise.resolve(
        admin
          .delete(`/api/v1/projects/${project.id}`)
          .send({ version: project.version }),
      );
      await waitForLockWaiters(watcher, 1);
      expect(
        await count(
          "SELECT count(*)::int AS n FROM projects WHERE id = $1 AND deleted_at IS NULL",
          [project.id],
        ),
      ).toBe(1);
    });
    expect((await deletion)?.status).toBe(204);
    await expect(
      withLiveProjectTransaction(context.db, project.id, async () => "wrote"),
    ).rejects.toMatchObject({ status: 404, code: "PROJECT_NOT_FOUND" });
  });
});
