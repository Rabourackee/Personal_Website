// Copies the interactive apps listed in apps.json into .apps/, which Eleventy
// publishes as-is (.apps/play/relativity/ -> yuhanwang.net/play/relativity/).
// Each app keeps its own repository; this site only takes a copy at build time.
//
//   node scripts/fetch_apps.mjs           clone each app's repository (the deploy does this)
//   node scripts/fetch_apps.mjs --local   copy from the "local" folder instead, for previews
//
// The copied files are served, never run during the build.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apps = JSON.parse(fs.readFileSync(path.join(root, "apps.json"), "utf8"));
const useLocal = process.argv.includes("--local");
const outRoot = path.join(root, ".apps");

fs.rmSync(outRoot, { recursive: true, force: true });
for (const app of apps) {
  const dest = path.join(outRoot, app.path);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (useLocal && app.local && fs.existsSync(path.resolve(root, app.local))) {
    fs.cpSync(path.resolve(root, app.local), dest, {
      recursive: true,
      filter: (src) => path.basename(src) !== ".git",
    });
    console.log(`${app.name}: copied from ${app.local}`);
  } else {
    const args = ["clone", "--quiet", "--depth", "1"];
    if (app.ref) args.push("--branch", app.ref);
    // run from outside this repository, so its git settings (on the deploy, a
    // token for this repository only) are not sent to the app's repository
    execFileSync("git", [...args, app.repo, dest], {
      cwd: os.tmpdir(),
      stdio: "inherit",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    const sha = execFileSync("git", ["-C", dest, "rev-parse", "--short", "HEAD"]).toString().trim();
    fs.rmSync(path.join(dest, ".git"), { recursive: true, force: true });
    console.log(`${app.name}: ${app.repo} @ ${sha}`);
  }
  for (const name of app.drop || []) fs.rmSync(path.join(dest, name), { recursive: true, force: true });
}
