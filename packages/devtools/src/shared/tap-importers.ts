/**
 * Importers that must see the REAL @vkontakte/vk-bridge: the redirect
 * target, @vkma.dev/bridge (older wrapper versions imported the original —
 * aliasing that import would create a self-cycle and a TDZ crash), in
 * whatever layout pnpm places it.
 *
 * Matches both importer spellings: Vite's `resolveId` passes the importing
 * FILE (`…/packages/bridge/dist/index.js`), rspack's replacement plugin
 * passes the importing DIRECTORY (`…/packages/bridge/dist`) — hence the
 * optional trailing slash.
 */
export const TAP_IMPORTERS =
	/(?:\/packages\/bridge\/(?:src|dist)(?:\/|$)|@vkma\.dev\+bridge|node_modules\/@vkma\.dev\/bridge(?:\/|$))/;
