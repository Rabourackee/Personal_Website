// The four fields named in the homepage statement. A project belongs to every
// field one of its topics matches. The homepage index and the Projects page
// filter by them, in this order (the statement keeps its own word order).
export default [
  { key: "ai", label: "AI", match: /^(AI|Computer Vision)$/i },
  { key: "physical", label: "physical interaction", match: /tangible|haptic|sensor|robot/i },
  { key: "xr", label: "XR", match: /^(MR|VR|Immersive)$/i },
  { key: "architecture", label: "architecture", match: /architect/i },
];
