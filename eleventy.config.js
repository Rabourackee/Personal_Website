import { HtmlBasePlugin } from "@11ty/eleventy";
import disciplines from "./src/_data/disciplines.js";

export default function (eleventyConfig) {
  // Rewrites root-relative URLs (/media/..., /about/) when the site is served
  // from a sub-path, e.g. username.github.io/Personal_Website/ before the
  // custom domain is connected. Set via --pathprefix in the deploy workflow.
  eleventyConfig.addPlugin(HtmlBasePlugin);

  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/media");
  eleventyConfig.addPassthroughCopy("src/files");
  eleventyConfig.addPassthroughCopy({ "src/static": "/" });
  for (const font of ["geist", "geist-mono"]) {
    const from = `node_modules/@fontsource-variable/${font}`;
    eleventyConfig.addPassthroughCopy({
      [`${from}/files`]: `assets/fonts/${font}/files`,
      [`${from}/wght.css`]: `assets/fonts/${font}/wght.css`,
      [`${from}/wght-italic.css`]: `assets/fonts/${font}/wght-italic.css`,
    });
  }

  // Every file in src/projects/ is a project, ordered by its `order` field.
  eleventyConfig.addCollection("projects", (api) =>
    api.getFilteredByGlob("src/projects/*.html").sort((a, b) => a.data.order - b.data.order)
  );
  // Projects with `featured: <n>` appear in the homepage carousel, in that order.
  eleventyConfig.addCollection("featured", (api) =>
    api
      .getFilteredByGlob("src/projects/*.html")
      .filter((p) => p.data.featured)
      .sort((a, b) => a.data.featured - b.data.featured)
  );
  eleventyConfig.addCollection("topics", (api) => {
    const topics = new Set();
    for (const p of api.getFilteredByGlob("src/projects/*.html")) {
      for (const t of p.data.topics || []) topics.add(t);
    }
    return [...topics];
  });

  eleventyConfig.addFilter("inSection", (projects, section) =>
    projects.filter((p) => p.data.section === section)
  );
  eleventyConfig.addFilter("withTopic", (projects, topic) =>
    projects.filter((p) => (p.data.topics || []).includes(topic))
  );
  // Matches Cargo's tag URLs: "UI/UX" -> "uiux", "3D Environment" -> "3d-environment"
  eleventyConfig.addFilter("topicSlug", (topic) =>
    topic.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-")
  );

  // The fields (src/_data/disciplines.js) a project's topics belong to: ["xr", "ai"].
  const fieldsOf = (topics = []) =>
    disciplines.filter((d) => topics.some((t) => d.match.test(t))).map((d) => d.key);
  eleventyConfig.addFilter("fields", fieldsOf);
  eleventyConfig.addFilter("inField", (projects, key) =>
    projects.filter((p) => fieldsOf(p.data.topics).includes(key))
  );
  // A project's number in the index: its 1-based position in collections.projects.
  eleventyConfig.addFilter("projectNumber", (projects, url) => projects.findIndex((p) => p.url === url) + 1);
  eleventyConfig.addFilter("pad", (n) => String(n).padStart(2, "0"));
  // "2010–2026": the earliest and latest year any of the projects mentions.
  eleventyConfig.addFilter("yearSpan", (projects) => {
    const years = projects.flatMap((p) => String(p.data.year || "").match(/\d{4}/g) || []).map(Number);
    return years.length ? `${Math.min(...years)}–${Math.max(...years)}` : "";
  });

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    // Page bodies are plain HTML; don't run them through a template language.
    htmlTemplateEngine: false,
  };
}
