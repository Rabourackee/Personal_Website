// Live apps on project pages (<figure class="app" data-app="/play/…/">): the
// poster stays until you press play, then the app loads in its place. Nothing
// is fetched before that, so the page itself stays light.
(function () {
  document.querySelectorAll(".app[data-app]").forEach(function (fig) {
    var frame = fig.querySelector(".app-frame");
    var btn = fig.querySelector(".app-play");
    btn.hidden = false;
    btn.addEventListener("click", function () {
      var iframe = document.createElement("iframe");
      iframe.src = fig.dataset.app;
      iframe.title = fig.dataset.title || "Live app";
      iframe.allow = "fullscreen";
      iframe.setAttribute("allowfullscreen", "");
      frame.replaceChildren(iframe);
      fig.classList.add("is-live");
      iframe.focus();
    });
  });
})();
