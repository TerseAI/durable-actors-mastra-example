import { useEffect, useState } from "react";

import { ChatPane, type SplitDirection } from "./ChatPane";
import { ChatSession, chatIdPattern, newChatId } from "./chatSession";

type Layout =
  | { type: "pane"; id: string }
  | { type: "split"; id: string; direction: SplitDirection; children: [Layout, Layout] };

const sessions = new Map<string, ChatSession>();

function addPane(chatId = newChatId()): Layout {
  const id = crypto.randomUUID();
  sessions.set(id, new ChatSession(chatId));
  return { type: "pane", id };
}

function firstPane(layout: Layout): string {
  return layout.type === "pane" ? layout.id : firstPane(layout.children[0]);
}

function countPanes(layout: Layout): number {
  return layout.type === "pane" ? 1 : countPanes(layout.children[0]) + countPanes(layout.children[1]);
}

function replacePane(layout: Layout, paneId: string, replace: (pane: Layout) => Layout): Layout {
  if (layout.type === "pane") return layout.id === paneId ? replace(layout) : layout;
  const [first, second] = layout.children;
  return { ...layout, children: [replacePane(first, paneId, replace), replacePane(second, paneId, replace)] };
}

/** Replaces the split containing `paneId` with the pane's sibling; returns the sibling too. */
function removePane(layout: Layout, paneId: string): { layout: Layout; sibling?: Layout } {
  if (layout.type === "pane") return { layout };
  const [first, second] = layout.children;
  if (first.type === "pane" && first.id === paneId) return { layout: second, sibling: second };
  if (second.type === "pane" && second.id === paneId) return { layout: first, sibling: first };
  const left = removePane(first, paneId);
  const right = removePane(second, paneId);
  return { layout: { ...layout, children: [left.layout, right.layout] }, sibling: left.sibling ?? right.sibling };
}

function initialLayout(): Layout {
  const room = new URL(location.href).searchParams.get("chat") ?? "";
  return addPane(chatIdPattern.test(room) ? room : undefined);
}

export function App() {
  const [layout, setLayout] = useState(initialLayout);
  const [activeId, setActiveId] = useState(() => firstPane(layout));
  const [focusId, setFocusId] = useState<string>();
  const single = countPanes(layout) === 1;

  function split(paneId: string, direction: SplitDirection) {
    const next = addPane();
    const nextId = firstPane(next);
    setLayout(current => replacePane(current, paneId, pane => ({
      type: "split",
      id: crypto.randomUUID(),
      direction,
      children: [pane, next],
    })));
    setActiveId(nextId);
    setFocusId(nextId);
  }

  function close(paneId: string) {
    if (single) return;
    const { layout: next, sibling } = removePane(layout, paneId);
    sessions.get(paneId)?.close();
    sessions.delete(paneId);
    setLayout(next);
    if (sibling) {
      const siblingId = firstPane(sibling);
      setActiveId(siblingId);
      setFocusId(siblingId);
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.isComposing) return;
      const direction = ({ KeyN: "horizontal", KeyM: "vertical" } as const)[event.code as "KeyN" | "KeyM"];
      if (!direction) return;
      event.preventDefault();
      if (!event.repeat) split(activeId, direction);
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [activeId]);

  function render(node: Layout) {
    if (node.type === "split") {
      return (
        <div key={node.id} className="split" data-direction={node.direction}>
          {node.children.map(render)}
        </div>
      );
    }
    return (
      <ChatPane
        key={node.id}
        session={sessions.get(node.id)!}
        active={node.id === activeId}
        autoFocus={node.id === focusId}
        onActivate={() => setActiveId(node.id)}
        onSplit={direction => split(node.id, direction)}
        onClose={() => close(node.id)}
      />
    );
  }

  return (
    <main className="panes" aria-label="Chat workspace" data-single={String(single)}>
      {render(layout)}
    </main>
  );
}
