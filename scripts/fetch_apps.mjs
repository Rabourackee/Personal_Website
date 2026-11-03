// Copies the interactive apps listed in apps.json into .apps/, which Eleventy
// publishes as-is (.apps/play/relativity/ -> yuhanwang.net/play/relativity/).
// Each app keeps its own repository; this site only takes a copy at build time.
//
//   node scripts/fetch_apps.mjs           clone each app's repository (the deploy does this)
//   node scripts/fetch_apps.mjs --local   copy from the "local" folder instead, for previews
//
// The copied files are served, never run during the build. A private app
// repository needs a token with read access in APPS_TOKEN (on the deploy, the
// repository secret of that name).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apps = JSON.parse(fs.readFileSync(path.join(root, "apps.json"), "utf8"));
const useLocal = process.argv.includes("--local");
const token = process.env.APPS_TOKEN || "";
const hide = (s) => (token ? String(s).split(token).join("***") : String(s));
const withToken = (url) => (token ? url.replace("https://", `https://x-access-token:${token}@`) : url);
const outRoot = path.join(root, ".apps");

fs.rmSync(outRoot, { recursive: true, force: true });
try {
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
    try {
      const args = ["clone", "--quiet", "--depth", "1"];
      if (app.ref) args.push("--branch", app.ref);
      // run from outside this repository, so its git settings (on the deploy, a
      // token for this repository only) are not sent to the app's repository
      execFileSync("git", [...args, withToken(app.repo), dest], {
        cwd: os.tmpdir(),
        stdio: ["ignore", "inherit", "pipe"],
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
      const sha = execFileSync("git", ["-C", dest, "rev-parse", "--short", "HEAD"]).toString().trim();
      fs.rmSync(path.join(dest, ".git"), { recursive: true, force: true });
      console.log(`${app.name}: ${app.repo} @ ${sha}`);
    } catch (err) {
      // fall back to GitHub's archive of the branch
      console.log(`::warning::git clone of ${app.repo} failed (${hide(err.stderr || err.message).trim().slice(0, 300)}); downloading the archive instead`);
      fs.rmSync(dest, { recursive: true, force: true });
      await fetchArchive(app, dest);
    }
  }
  for (const name of app.drop || []) fs.rmSync(path.join(dest, name), { recursive: true, force: true });
  // an app repository without its page (an unpushed commit, a wrong branch) would
  // otherwise publish an empty folder and a broken play button
  if (!fs.existsSync(path.join(dest, "index.html"))) {
    throw new Error(`${app.name}: no index.html in ${useLocal ? app.local : app.repo}; has its work been pushed?`);
  }
}
} catch (err) {
  console.log(`::error::${hide(err && err.message || err).slice(0, 500)}`);
  process.exit(1);
}

async function fetchArchive(app, dest) {
  const m = app.repo.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!m) throw new Error(`not a GitHub repository: ${app.repo}`);
  const url = `https://api.github.com/repos/${m[1]}/${m[2]}/tarball/${app.ref || ""}`;
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}${res.status === 404 && !token ? " (a private repository needs APPS_TOKEN)" : ""}`);
  const file = path.join(os.tmpdir(), `${m[2]}-${Date.now()}.tar.gz`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  fs.mkdirSync(dest, { recursive: true });
  execFileSync("tar", ["-xzf", file, "-C", dest, "--strip-components=1"], { stdio: "inherit" });
  fs.rmSync(file, { force: true });
  console.log(`${app.name}: ${url}`);
}

process.on("unhandledRejection", (err) => {
  console.log(`::error::${hide(err && err.message || err).slice(0, 500)}`);
  process.exit(1);
});
