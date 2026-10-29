// Two UI windows can finish loading in either order. Test the intended document.
export async function dashboardPage(desktop) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const page = desktop
      .windows()
      .find(
        (p) => p.url().includes("index.html") && !p.url().includes("overlay=1"),
      );
    if (page) return page;
    await new Promise((done) => setTimeout(done, 40));
  }
  throw new Error("EveryHint dashboard did not load.");
}
export async function finishSetup(page) {
  await page.waitForFunction(
    () => window.everyhint && document.querySelector(".app"),
  );
  const state = await page.evaluate(() => window.everyhint.getSnapshot());
  if (state.value.settings.setupComplete === false) {
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page
      .getByRole("button", { name: "Continue · AI can be connected later" })
      .click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByRole("button", { name: "Finish setup", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start EveryHint", exact: true })
      .waitFor();
  }
}
export async function navigate(page, name) {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name, exact: true })
    .click();
}
export async function settingsSection(page, name) {
  await navigate(page, "Settings");
  await page
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("button", { name, exact: true })
    .click();
}
export async function sessionOptions(page) {
  await navigate(page, "Assistant");
  await page.locator(".session-options").evaluate((el) => (el.open = true));
}
