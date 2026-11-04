import { defineView } from "@vkma.dev/router/preset";

/** The feed story hub, the only place the "feed" view key is written. */
export const feedView = defineView("feed");

export const feedPanel = feedView.panel("feed", {}, () => import("./feed.ui"));

// "$id" declares a path param, typed via the panel handle, no manual parsing.
export const postPanel = feedView.panel("post/$id", {}, () => import("./post.ui"));
