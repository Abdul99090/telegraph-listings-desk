/**
 * Signal side of the desk — our Jalur-Kita radar pattern, reused:
 *
 *   signal → evaluation → intent purchase → decision
 *
 * A *signal* is anything the radar surfaces that could need a listing
 * decision: a new token deployment, a listing application, a counterparty
 * appearing in tracked wallets' flows. This module normalises a signal
 * into the listing-application shape the desk evaluates. In production
 * the signal source is a chain watcher; here it is a plain function so
 * fixtures and tests can drive it.
 */

/**
 * @param {object} signal
 * @param {string} signal.tokenName
 * @param {string} signal.tokenSymbol
 * @param {string} signal.chain
 * @param {string} signal.contractAddress
 * @param {string} signal.deployer
 * @param {object} signal.metadata  Raw observations the desk asks Miners
 *   to verify (contract traits, holder distribution, early volume shape,
 *   social footprint). Miners — not this module — are the authority;
 *   metadata is only the desk's working notes.
 */
export function listingApplicationFromSignal(signal) {
  const required = ["tokenName", "contractAddress", "chain"];
  for (const key of required) {
    if (!signal?.[key]) throw new Error(`Signal is missing required field: ${key}`);
  }
  return {
    kind: "listing-application",
    tokenName: signal.tokenName,
    tokenSymbol: signal.tokenSymbol ?? "",
    chain: signal.chain,
    contractAddress: signal.contractAddress,
    deployer: signal.deployer ?? null,
    submittedAt: signal.submittedAt ?? new Date().toISOString(),
    metadata: signal.metadata ?? {},
  };
}
