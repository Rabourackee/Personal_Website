// Defaults for every project page: served at /<file-name>/ (same URLs as on Cargo).
export default {
  layout: "base.njk",
  eleventyComputed: {
    permalink: (data) => `/${data.page.fileSlug}/`,
  },
};
