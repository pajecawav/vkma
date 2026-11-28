// Behaviour shared by every page: theme, code copy, package-manager tabs,
// contents scroll-spy, the navigation drawer and the search dialog (Pagefind).
import { t, type Locale } from "../lib/i18n";

/** One hit; its fields load lazily through `data()`. */
interface PagefindResult {
	id: number;
	data(): Promise<{
		url: string;
		excerpt?: string;
		meta: { title?: string; description?: string };
	}>;
}

/** The module `/pagefind/pagefind.js` exports (written by the build). */
interface Pagefind {
	debouncedSearch(query: string): Promise<{ results: PagefindResult[] } | null>;
}

interface Row {
	url: string;
	title: string;
	section: string;
	excerpt?: string;
}

// a plain string, not a literal: the bundler must leave this import alone —
// the file only exists after `astro build`
const PAGEFIND_SRC = "/pagefind/pagefind.js";

const root = document.documentElement;
const ui = t(root.lang as Locale);
const $ = <T extends Element>(selector: string, scope: ParentNode = document): T | null =>
	scope.querySelector<T>(selector);
const $$ = <T extends Element>(selector: string, scope: ParentNode = document): T[] => [
	...scope.querySelectorAll<T>(selector),
];

function store(key: string, value?: string): string | null {
	try {
		if (value === undefined) {
			return localStorage.getItem(key);
		}
		localStorage.setItem(key, value);
	} catch {
		// storage is unavailable (private mode, blocked) — the site works without memory
	}
	return null;
}

const element = <T extends HTMLElement>(tag: string, className: string, content: string): T => {
	const node = document.createElement(tag);
	node.className = className;
	node.textContent = content;
	return node as T;
};

/* ---------------------------------------------------------------- theme */

function setTheme(next: string): void {
	root.dataset.theme = next;
	store("vkma-theme", next);
}

$$("[data-theme-toggle]").forEach(button =>
	button.addEventListener("click", () =>
		setTheme(root.dataset.theme === "dark" ? "light" : "dark"),
	),
);

/* ------------------------------------------------------------ keyboard */

const mac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
$$("[data-kbd]").forEach(kbd => {
	kbd.textContent = mac ? "⌘K" : "Ctrl K";
});

/* ----------------------------------------------------------------- copy */

function flash(button: HTMLElement): void {
	if (!button.dataset.label) {
		button.dataset.label = button.getAttribute("aria-label") ?? "";
	}
	button.classList.add("is-done");
	button.setAttribute("aria-label", ui.copied);
	window.setTimeout(() => {
		button.classList.remove("is-done");
		button.setAttribute("aria-label", button.dataset.label ?? "");
	}, 1600);
}

$$<HTMLElement>("[data-copy]").forEach(button =>
	button.addEventListener("click", () => {
		// in a tab group the active panel is copied, never the whole group
		const group = button.closest(".code-group");
		const scope = group
			? $('[role="tabpanel"]:not([hidden])', group)
			: button.closest(".code-body");
		const source = scope?.querySelector("pre");
		if (source && navigator.clipboard) {
			navigator.clipboard.writeText(source.textContent ?? "").then(
				() => flash(button),
				() => flash(button),
			);
		}
	}),
);

/* -------------------------------------------------- package-manager tabs */

// WAI-ARIA tabs: roving tabindex, arrow keys, automatic activation.
// Without JS every panel stays visible — the script only hides.
const savedPm = store("vkma-pm");

$$(".code-group").forEach(group => {
	const tabs = $$<HTMLElement>('[role="tab"]', group);
	const panels = $$<HTMLElement>('[role="tabpanel"]', group);

	const activate = (tab: HTMLElement, focus: boolean): void => {
		for (const other of tabs) {
			const on = other === tab;
			other.setAttribute("aria-selected", String(on));
			other.tabIndex = on ? 0 : -1;
		}
		for (const panel of panels) {
			panel.hidden = panel.id !== tab.getAttribute("aria-controls");
		}
		if (focus) {
			tab.focus();
		}
	};

	const first = tabs.find(tab => tab.dataset.pm === savedPm) ?? tabs[0];
	if (first) {
		activate(first, false);
	}

	for (const tab of tabs) {
		const pick = (): void => {
			activate(tab, false);
			if (tab.dataset.pm) {
				store("vkma-pm", tab.dataset.pm);
			}
		};
		tab.addEventListener("click", pick);
		tab.addEventListener("keydown", event => {
			const index = tabs.indexOf(tab);
			let next: HTMLElement | undefined;
			if (event.key === "ArrowRight") {
				next = tabs[(index + 1) % tabs.length];
			} else if (event.key === "ArrowLeft") {
				next = tabs[(index - 1 + tabs.length) % tabs.length];
			} else if (event.key === "Home") {
				next = tabs[0];
			} else if (event.key === "End") {
				next = tabs.at(-1);
			}
			if (next) {
				event.preventDefault();
				activate(next, true);
				if (next.dataset.pm) {
					store("vkma-pm", next.dataset.pm);
				}
			}
		});
	}
});

/* --------------------------------------------------- contents scroll-spy */

const tocLinks = $$(".toc a[href^='#'], .toc-m a[href^='#']");
if (tocLinks.length > 0) {
	const wanted = new Set(tocLinks.map(link => link.getAttribute("href")?.slice(1)));
	const headings = $$(".prose [id]").filter(
		node => /^H[2-6]$/.test(node.tagName) && wanted.has(node.id),
	);
	let current: string | null = null;

	const update = (): void => {
		let active = headings[0]?.id ?? null;
		for (const heading of headings) {
			if (heading.getBoundingClientRect().top <= 120) {
				active = heading.id;
			}
		}
		if (active === current) {
			return;
		}
		current = active;
		for (const link of tocLinks) {
			if (link.getAttribute("href") === `#${active}`) {
				link.setAttribute("aria-current", "true");
			} else {
				link.removeAttribute("aria-current");
			}
		}
	};

	let queued = false;
	const schedule = (): void => {
		if (queued) {
			return;
		}
		queued = true;
		requestAnimationFrame(() => {
			queued = false;
			update();
		});
	};
	window.addEventListener("scroll", schedule, { passive: true });
	window.addEventListener("resize", schedule);
	update();
}

/* --------------------------------------------------------------- drawer */

const drawer = $<HTMLDialogElement>("dialog[data-drawer]");
if (drawer) {
	$$("[data-drawer-open]").forEach(button =>
		button.addEventListener("click", () => {
			if (!drawer.open) {
				drawer.showModal();
			}
		}),
	);
	$$("[data-drawer-close]", drawer).forEach(button =>
		button.addEventListener("click", () => drawer.close()),
	);
	drawer.addEventListener("click", event => {
		// the backdrop is the dialog element itself
		if (event.target === drawer) {
			drawer.close();
		}
		const link = (event.target as Element | null)?.closest("a");
		if (link?.getAttribute("href")?.startsWith("#")) {
			drawer.close();
		}
	});
}

/* --------------------------------------------------------------- search */

const dialog = $<HTMLDialogElement>("dialog[data-search-dialog]");
if (dialog) {
	const input = $<HTMLInputElement>("input", dialog);
	const list = $<HTMLElement>(".sd-results", dialog);
	if (input && list) {
		const quick: Row[] = $$<HTMLElement>(".sd-r", list).map(item => ({
			url: item.dataset.url ?? "",
			title: $(".rt", item)?.textContent ?? "",
			section: $(".rs", item)?.textContent ?? "",
		}));
		let items: Row[] = [];
		let selected = 0;
		let api: Promise<Pagefind | null> | null = null;

		// Pagefind is a module the build writes next to the pages; it picks the
		// language index from <html lang>. In `astro dev` there is no index yet
		// and search says so.
		const load = (): Promise<Pagefind | null> =>
			(api ??= import(/* @vite-ignore */ PAGEFIND_SRC).then(
				(module: Partial<Pagefind>) =>
					module.debouncedSearch ? (module as Pagefind) : null,
				() => null,
			));

		const sectionOf = (url: string): string => {
			const parts = url
				.replace(/^https?:\/\/[^/]+/, "")
				.split("/")
				.filter(Boolean);
			if (parts[0] === "en") {
				parts.shift();
			}
			return parts[0] ?? "vkma.dev";
		};

		const paint = (): void => {
			$$(".sd-r", list).forEach((item, index) => {
				const on = index === selected;
				item.setAttribute("aria-selected", String(on));
				if (on) {
					item.scrollIntoView({ block: "nearest" });
				}
			});
		};

		const render = (rows: Row[]): void => {
			items = rows;
			selected = 0;
			list.replaceChildren(
				...rows.map(row => {
					const item = document.createElement("li");
					item.className = "sd-r";
					item.setAttribute("role", "option");
					item.setAttribute("aria-selected", "false");
					item.dataset.url = row.url;
					item.append(
						element("span", "rt", row.title),
						element("span", "rs", row.section),
					);
					if (row.excerpt) {
						// Pagefind's excerpt is build-time HTML of our own pages
						const excerpt = document.createElement("span");
						excerpt.className = "rd";
						excerpt.innerHTML = row.excerpt;
						item.append(excerpt);
					}
					return item;
				}),
			);
		};

		const notice = (message: string): void => {
			items = [];
			list.replaceChildren(element("li", "sd-empty", message));
		};

		const run = async (query: string): Promise<void> => {
			const q = query.trim();
			if (!q) {
				return render(quick);
			}
			const pagefind = await load();
			if (!pagefind) {
				return notice(ui.searchHint);
			}
			// null: a newer query superseded this one — that one renders
			const response = await pagefind.debouncedSearch(q);
			if (response === null) {
				return;
			}
			if (response.results.length === 0) {
				return notice(ui.noResults);
			}
			const results = await Promise.all(response.results.map(result => result.data()));
			render(
				results.map(result => ({
					url: result.url,
					title: result.meta.title ?? result.url,
					section: sectionOf(result.url),
					excerpt: result.excerpt,
				})),
			);
		};

		const open = (): void => {
			if (!dialog.open) {
				dialog.showModal();
			}
			input.value = "";
			render(quick);
			input.focus();
			void load();
		};

		$$("[data-search]").forEach(button => button.addEventListener("click", open));
		input.addEventListener("input", () => void run(input.value));
		list.addEventListener("click", event => {
			const item = (event.target as Element).closest(".sd-r") as HTMLElement | null;
			const url = item?.dataset.url;
			if (url) {
				location.href = url;
			}
		});
		list.addEventListener("pointermove", event => {
			const item = (event.target as Element).closest(".sd-r") as HTMLElement | null;
			if (!item) {
				return;
			}
			const index = items.findIndex(row => row.url === item.dataset.url);
			if (index >= 0 && index !== selected) {
				selected = index;
				paint();
			}
		});
		dialog.addEventListener("keydown", event => {
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				if (items.length === 0) {
					return;
				}
				selected =
					(selected + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
				paint();
			} else if (event.key === "Enter") {
				const url = items[selected]?.url;
				if (url) {
					event.preventDefault();
					location.href = url;
				}
			}
		});
		dialog.addEventListener("click", event => {
			if (event.target === dialog) {
				dialog.close();
			}
		});
		document.addEventListener("keydown", event => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				if (dialog.open) {
					dialog.close();
				} else {
					open();
				}
			}
		});
	}
}
