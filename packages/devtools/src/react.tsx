import type { JSX } from "react";
import { hello } from "./index.ts";

export interface HelloProps {
	name?: string;
}

export function Hello({ name = "devtools" }: HelloProps): JSX.Element {
	return <h1>{hello(name)}</h1>;
}
