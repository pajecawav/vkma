import { describe, expect, it } from "vitest";
import { detectPackageManager, installCommand, isPackageManager, runCommand } from "./pm.ts";

describe("detectPackageManager", () => {
	it("parses real user agents", () => {
		expect(detectPackageManager("pnpm/10.1.0 npm/? node/v26.9.0 linux x64")).toBe("pnpm");
		expect(detectPackageManager("npm/11.0.0 node/v26.9.0 linux x64")).toBe("npm");
		expect(detectPackageManager("yarn/4.6.0 npm/? node/v26.9.0 linux x64")).toBe("yarn");
		expect(detectPackageManager("bun/1.2.0 npm/? node/v26.9.0 linux x64")).toBe("bun");
	});

	it("no user agent → null", () => {
		expect(detectPackageManager(undefined)).toBeNull();
		expect(detectPackageManager("")).toBeNull();
	});

	it("unknown agents → null", () => {
		expect(detectPackageManager("deno/2.0.0")).toBeNull();
	});
});

describe("installCommand / runCommand", () => {
	it("install is <pm> install for every manager", () => {
		for (const pm of ["npm", "pnpm", "yarn", "bun"] as const) {
			expect(installCommand(pm)).toEqual({ command: pm, args: ["install"] });
		}
	});

	it("run commands match each manager's script syntax", () => {
		expect(runCommand("npm", "dev")).toBe("npm run dev");
		expect(runCommand("pnpm", "dev")).toBe("pnpm dev");
		expect(runCommand("yarn", "dev")).toBe("yarn dev");
		expect(runCommand("bun", "dev")).toBe("bun run dev");
	});

	it("isPackageManager guards", () => {
		expect(isPackageManager("pnpm")).toBe(true);
		expect(isPackageManager("deno")).toBe(false);
	});
});
