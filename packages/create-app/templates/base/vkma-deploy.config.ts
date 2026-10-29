import { defineDeployConfig } from "@vkma.dev/deploy";

export default defineDeployConfig({
	// Create an app at https://dev.vk.com/mini-apps and put its id here.
	appId: 0,
	staticPath: "./dist",
	endpoints: {
		mobile: "index.html",
		mvk: "index.html",
		web: "index.html",
	},
	environment: "both",
});
