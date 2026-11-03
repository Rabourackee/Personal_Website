// The four fields named in the homepage statement. A project belongs to every
// field one of its topics matches. The homepage index and the Projects page
// filter by them.
export default [
  { key: "architecture", label: "architecture", match: /architect/i },
  { key: "xr", label: "XR", match: /^(MR|VR|Immersive)$/i },
  { key: "physical", label: "physical interaction", match: /tangible|haptic|sensor|robot/i },
  { key: "ai", label: "AI", match: /^(AI|Computer Vision)$/i },
];
