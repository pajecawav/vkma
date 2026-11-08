import { defineDeployConfig } from "@vkma.dev/deploy";

export default defineDeployConfig({
	// Real deploys stay opt-in: VKMA_APP_ID=123 pnpm deploy.
	appId: Number(process.env.VKMA_APP_ID ?? 0),
	staticPath: "./dist",
	endpoints: {
		mobile: "index.html",
		mvk: "index.html",
		web: "index.html",
	},
	environment: "both",
});
