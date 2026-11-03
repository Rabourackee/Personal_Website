// The four fields named in the homepage statement. A project belongs to every
// field one of its topics matches. The homepage index and the Projects page
// filter by them, and each one has a colour from the secondary palette
// (--architecture, --xr, --physical, --ai in site.css).
export default [
  { key: "architecture", label: "architecture", match: /architect/i },
  { key: "xr", label: "XR", match: /^(MR|VR|Immersive)$/i },
  { key: "physical", label: "physical interaction", match: /tangible|haptic|sensor|robot/i },
  { key: "ai", label: "AI", match: /^(AI|Computer Vision)$/i },
];
