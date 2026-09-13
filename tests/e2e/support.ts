import { expect, type Page } from "@playwright/test";
import { adminCredentials, memberCredentials } from "../support/test-context";

export { adminCredentials, memberCredentials };

/** Signs in through the real Vault login form and waits for Projects. */
export async function signIn(
  page: Page,
  credentials: { email: string; password: string },
) {
  await page.goto("/");
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
}

/** Signs out through the account menu and waits for the login page. */
export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: /log out/i }).click();
  await expect(page).toHaveURL(/\/$/);
}
