import { definePanel } from "@vkma.dev/router/preset";

/** The chats list panel — no data hooks, a pure definition + lazy chunk. */
export const chatsPanel = definePanel("messages", "messages", {}, () => import("./messages"));
