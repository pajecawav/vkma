import { VkmaLogoIcon } from "@vkma.dev/ui";

export function App() {
	return (
		<div className="flex h-dvh flex-col items-center justify-center gap-2">
			<VkmaLogoIcon className="text-neutral-900 dark:text-neutral-100" />
			<p className="text-sm text-neutral-500">vkma devtools extension</p>
		</div>
	);
}
