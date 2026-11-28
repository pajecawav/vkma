import { glob } from "astro/loaders";
import { defineCollection, z } from "astro:content";

// Plain Markdown only. Frontmatter is the whole contract: `title`,
// `description`, and the sidebar's `order` / `label` (the label is the short
// page name the sidebar, llms.txt and prev/next show instead of the title).
// A `slug` key is deliberately not accepted — it would override the id the
// `.md` endpoints and the routes are derived from.
const docs = defineCollection({
	loader: glob({ base: "./src/content/docs", pattern: "**/[^_]*.md" }),
	schema: z.object({
		title: z.string(),
		description: z.string().default(""),
		sidebar: z
			.object({
				order: z.number().default(0),
				label: z.string().default(""),
			})
			.default(() => ({ order: 0, label: "" })),
	}),
});

export const collections = { docs };
