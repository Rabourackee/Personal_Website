import { HtmlBasePlugin } from "@11ty/eleventy";

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

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    // Page bodies are plain HTML; don't run them through a template language.
    htmlTemplateEngine: false,
  };
}
