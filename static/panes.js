import { createChat } from "./chat.js";

const workspace = document.getElementById("panes");
const chats = new Map();
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let active;

function activate(pane) {
  active?.removeAttribute("data-active");
  active = pane;
  active.dataset.active = "true";
  const url = new URL(location.href);
  url.searchParams.set("chat", chats.get(pane).room);
  history.replaceState(null, "", url);
}

function addPane(room = crypto.randomUUID()) {
  const chat = createChat(room);
  chats.set(chat.element, chat);
  workspace.dataset.single = String(chats.size === 1);
  return chat.element;
}

// Animate from the old bounds to the new layout; sockets and drafts stay in place.
function reflow(change) {
  const before = new Map([...chats.keys()].filter(pane => pane.isConnected).map(pane => [pane, pane.getBoundingClientRect()]));
  workspace.getAnimations({ subtree: true }).forEach(animation => {
    if (animation.id === "pane-layout") animation.cancel();
  });
  change();
  if (reducedMotion.matches) return;
  for (const [pane, from] of before) {
    if (!pane.isConnected) continue;
    const to = pane.getBoundingClientRect();
    pane.animate([
      { transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.width / to.width}, ${from.height / to.height})` },
      { transform: "none" },
    ], { id: "pane-layout", duration: 380, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
  }
}

function split(direction) {
  const current = active;
  const next = addPane();
  reflow(() => {
    const group = document.createElement("div");
    group.className = "split";
    group.dataset.direction = direction;
    current.replaceWith(group);
    group.append(current, next);
  });
  next.animate([
    { opacity: 0, clipPath: reducedMotion.matches ? "none" : direction === "horizontal" ? "inset(0 0 100% 0)" : "inset(0 100% 0 0)" },
    { opacity: 1, clipPath: "inset(0)" },
  ], { id: "pane-layout", duration: reducedMotion.matches ? 100 : 420, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
  activate(next);
  next.scrollIntoView({ block: "nearest", inline: "nearest" });
  next.querySelector("textarea").focus({ preventScroll: true });
}

function closePane() {
  if (chats.size === 1) return;
  const pane = active;
  const group = pane.parentElement;
  const sibling = [...group.children].find(child => child !== pane);
  chats.get(pane).close();
  chats.delete(pane);
  reflow(() => group.replaceWith(sibling));
  workspace.dataset.single = String(chats.size === 1);
  activate(sibling.matches(".pane") ? sibling : sibling.querySelector(".pane"));
  active.querySelector("textarea").focus({ preventScroll: true });
}

for (const event of ["pointerdown", "focusin", "roomchange"]) {
  workspace.addEventListener(event, ({ target }) => {
    const pane = target.closest(".pane");
    if (pane) activate(pane);
  });
}
workspace.addEventListener("click", ({ target }) => {
  const button = target.closest("[data-action]");
  if (!button) return;
  activate(button.closest(".pane"));
  if (button.dataset.action === "close") closePane();
  else split(button.dataset.action);
});
window.addEventListener("keydown", event => {
  if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.isComposing) return;
  const direction = { KeyN: "horizontal", KeyM: "vertical" }[event.code];
  if (!direction) return;
  event.preventDefault();
  if (!event.repeat) split(direction);
}, { capture: true });

const room = new URL(location.href).searchParams.get("chat") || "";
const first = addPane(/^[a-zA-Z0-9_-]{1,64}$/.test(room) ? room : undefined);
workspace.append(first);
activate(first);
