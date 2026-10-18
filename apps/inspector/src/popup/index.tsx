import { render } from "solid-js/web";
import { App } from "./App.tsx";

const root = document.getElementById("root");

if (root !== null) {
	render(() => <App />, root);
}
