/**
 * Browser stand-in for `isomorphic-ws`.
 *
 * The shipped browser build only has a default export, but
 * `@midnight-ntwrk/midnight-js-indexer-public-data-provider` imports
 * `{ WebSocket }`. Without this the named import resolves to undefined and
 * indexer subscriptions fail at runtime.
 */
const NativeWebSocket = globalThis.WebSocket;

export { NativeWebSocket as WebSocket };
export default NativeWebSocket;
