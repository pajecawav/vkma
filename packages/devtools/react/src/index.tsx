import { hello } from "@vkma.dev/devtools-core";

export interface HelloProps {
	name?: string;
}

export function Hello({ name = "devtools" }: HelloProps) {
	return <h1>{hello(name)}</h1>;
}
