import { expect, test } from "@playwright/test";
import {
  adminCredentials,
  memberCredentials,
  signIn,
  signOut,
} from "./support";

const newUser = {
  email: "browser.person@vault.test",
  password: "Browser-Person-Strong-2026",
  displayName: "Browser Person",
};

test("closed-access lifecycle: bootstrap admin, provision, role limits, suspension, logout", async ({
  page,
  browser,
}) => {
  // 1-3. The bootstrapped admin signs in with email + password and reaches Projects and Admin.
  await signIn(page, adminCredentials);
  await expect(
    page.getByRole("link", { name: "Settings & Admin" }),
  ).toBeVisible();
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Users & Access" }),
  ).toBeVisible();
  const usersTable = page.getByRole("table");
  await expect(usersTable.getByText(adminCredentials.email)).toBeVisible();
  await expect(usersTable.getByText(memberCredentials.email)).toBeVisible();

  // 4. Admin creates a second user.
  await page.getByRole("button", { name: "Add user" }).click();
  await page.getByLabel("Name").fill(newUser.displayName);
  await page.getByLabel("Email").fill(newUser.email);
  await page.getByLabel("Initial password").fill(newUser.password);
  await page.getByRole("button", { name: "Create user" }).click();
  await expect(usersTable.getByText(newUser.email)).toBeVisible();
  await page.getByRole("tab", { name: "Audit log" }).click();
  await expect(page.getByText("user.provisioned").first()).toBeVisible();

  // 5-6. The second user signs in, reaches Projects, and is kept out of Admin.
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await signIn(memberPage, newUser);
  await expect(
    memberPage.getByRole("button", { name: "New Project", exact: true }),
  ).toHaveCount(0);
  await expect(
    memberPage.getByRole("link", { name: "Settings & Admin" }),
  ).toHaveCount(0);
  await memberPage.goto("/admin");
  await expect(memberPage).toHaveURL(/\/projects$/);
  const adminApi = await memberPage.evaluate(
    async () =>
      (await fetch("/api/v1/users", { credentials: "include" })).status,
  );
  expect(adminApi).toBe(403);

  // 7-8. Admin suspends the second user; their existing session is refused.
  await page.goto("/admin");
  const row = usersTable.getByRole("row").filter({ hasText: newUser.email });
  await row.getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Suspend" }).click();
  await expect(row.getByText("Suspended")).toBeVisible();
  const refused = await memberPage.evaluate(
    async () =>
      (await fetch("/api/v1/projects", { credentials: "include" })).status,
  );
  expect(refused).toBe(401);
  await memberPage.goto("/projects");
  await expect(memberPage.getByLabel("Email")).toBeVisible();
  await memberPage.getByLabel("Email").fill(newUser.email);
  await memberPage.getByLabel("Password").fill(newUser.password);
  await memberPage.getByRole("button", { name: "Sign in" }).click();
  await expect(memberPage.getByRole("alert")).toHaveText(/suspended/i);
  await memberContext.close();

  // 9. Logout removes access.
  await signOut(page);
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel("Email")).toBeVisible();
  const afterLogout = await page.evaluate(
    async () =>
      (await fetch("/api/v1/auth/me", { credentials: "include" })).status,
  );
  expect(afterLogout).toBe(401);
});

test("wrong credentials are refused with one generic message", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Email").fill(adminCredentials.email);
  await page.getByLabel("Password").fill("not-the-password-at-all");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Incorrect email or password.",
  );
  await expect(page).toHaveURL(/\/$/);
});
