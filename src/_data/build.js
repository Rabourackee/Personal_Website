// A new value on every build. Appended to CSS/JS URLs (?v=…) so browsers
// fetch fresh files after each deploy instead of reusing a cached copy.
export default {
  version: Date.now().toString(36),
};
