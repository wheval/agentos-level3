/**
 * Deployment coordinates for the counter contract.
 *
 * The address below is the live Preview deployment from Level 1. Override it
 * with VITE_CONTRACT_ADDRESS / VITE_NETWORK_ID when pointing the UI at a
 * different deployment.
 */
export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS ?? '2c5b229e9092c0726cafcc7b856ef2f0ae301e25b3eb97b63881ed715fb2fe4e';

/** The network the address above lives on. */
export const EXPECTED_NETWORK_ID = import.meta.env.VITE_NETWORK_ID ?? 'preview';

/**
 * Where the browser fetches proving/verifying keys and the ZKIR from.
 * `npm run sync:zk` copies these out of managed/ into public/zk/counter/.
 */
export const ZK_ASSET_PATH = '/zk/counter';

/** Key the contract's private state is filed under in the browser store. */
export const PRIVATE_STATE_ID = 'counterPrivateState' as const;
