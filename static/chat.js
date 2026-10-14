export function createChat(chatId) {
  const element = document.getElementById("chat-pane").content.firstElementChild.cloneNode(true);
  const $ = (name) => element.querySelector(`[data-ref="${name}"]`);
  let socket, generation = 0, ready = false, busy = false, draft;

  function controls() {
    $("send").disabled = !ready || busy || !$("message").value.trim();
    $("reset").disabled = !ready || busy;
  }

  function setConnection(state) {
    const label = { connecting: "Connecting", connected: "Connected" }[state];
    element.dataset.loading = String(state === "connecting");
    $("connection").dataset.state = state;
    $("connection").title = label;
    $("connection-label").textContent = label;
  }

  function addMessage(role, text, provisional = false) {
    const article = document.createElement("article");
    article.className = `message ${role}${provisional ? " pending" : ""}`;
    const speaker = document.createElement("div");
    speaker.className = "speaker";
    speaker.textContent = role === "user" ? "You" : "Assistant";
    const content = document.createElement("div");
    content.className = "content";
    content.textContent = text;
    article.append(speaker, content);
    $("messages").append(article);
    return content;
  }

  function nearBottom() {
    const area = $("scroll-area");
    return area.scrollHeight - area.clientHeight - area.scrollTop < 96;
  }

  function scrollToReply() { $("scroll-area").scrollTop = $("scroll-area").scrollHeight; }

  function renderHistory(messages) {
    const follow = nearBottom();
    const previousTop = $("scroll-area").scrollTop;
    $("messages").replaceChildren();
    for (const message of messages) addMessage(message.role, message.content);
    if (follow) scrollToReply();
    else $("scroll-area").scrollTop = previousTop;
  }

  async function connect() {
    const current = ++generation;
    if (socket) socket.close();
    ready = busy = false;
    draft = null;
    controls();
    $("room").value = chatId;
    element.setAttribute("aria-label", `Chat: ${chatId}`);
    setConnection("connecting");

    const response = await fetch(`/api/chat/${encodeURIComponent(chatId)}/socket`, { method: "POST" });
    const grant = await response.json();
    if (generation !== current) return;
    // Elysia grants access; all messages go directly to the durable actor.
    socket = new WebSocket(grant.websocketUrl);
    socket.onmessage = ({ data: raw }) => {
      if (generation !== current) return;
      const data = JSON.parse(raw);
      if (data.type === "history") {
        ready = true;
        busy = false;
        draft = null;
        setConnection("connected");
        renderHistory(data.messages);
        scrollToReply();
      } else if (data.type === "start") {
        busy = true;
        addMessage("user", data.prompt, true);
        draft = addMessage("assistant", "", true);
        scrollToReply();
      } else if (data.type === "delta") {
        const follow = nearBottom();
        if (draft) draft.textContent += data.text;
        if (follow) scrollToReply();
      } else if (data.type === "done") {
        busy = false;
        for (const message of $("messages").querySelectorAll(".pending")) message.classList.remove("pending");
        draft = null;
      }
      controls();
    };
  }

  function send() {
    const message = $("message").value.trim();
    if (!ready || busy || !message) return;
    busy = true;
    socket.send(JSON.stringify(message));
    $("message").value = "";
    controls();
  }

  function openChat(id) {
    chatId = id;
    element.dispatchEvent(new Event("roomchange", { bubbles: true }));
    $("messages").replaceChildren();
    $("message").value = "";
    connect();
  }

  $("composer").onsubmit = (event) => { event.preventDefault(); send(); };
  $("message").oninput = controls;
  $("message").onkeydown = (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); }
  };
  $("room-form").onsubmit = (event) => { event.preventDefault(); openChat($("room").value); };
  $("reset").onclick = () => fetch(`/api/chat/${encodeURIComponent(chatId)}/reset`, { method: "POST" });
  connect();

  return {
    element,
    get room() { return chatId; },
    close() { ++generation; socket?.close(); },
  };
}
