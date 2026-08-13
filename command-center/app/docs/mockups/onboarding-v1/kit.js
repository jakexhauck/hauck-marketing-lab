// Shared behaviour for the onboarding mockups: theme toggle + tickable rows.
// Deliberately tiny. These are mockups; the point is that the interactions feel
// real enough to judge the layout, not that they persist anything.
document.addEventListener("click", (e) => {
  const themeBtn = e.target.closest("[data-theme-toggle]");
  if (themeBtn) {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    themeBtn.textContent = next === "dark" ? "Light" : "Dark";
    return;
  }
  // queue rows: the whole row goes quiet when its box is ticked
  const qbox = e.target.closest(".item .box");
  if (qbox) {
    const item = qbox.closest(".item");
    item.classList.toggle("did");
    const on = item.classList.contains("did");
    qbox.textContent = on ? "✓" : "";
    qbox.style.backgroundImage = on ? "linear-gradient(135deg,#15803d,#22c55e)" : "";
    qbox.style.borderColor = on ? "transparent" : "";
    return;
  }
  const tick = e.target.closest(".tick");
  if (tick) {
    tick.classList.toggle("on");
    const box = tick.querySelector(".box");
    if (box) box.textContent = tick.classList.contains("on") ? "✓" : "";
  }
});
