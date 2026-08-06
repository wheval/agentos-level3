#!/usr/bin/env bash
# Reads the deployed contract back from the Midnight indexer.
# Anyone can run this to confirm the address in README.md is real.
#
#   ./scripts/verify.sh [network] [address] [deploy-tx-hash]
#
# The indexer's contractAction(address:) resolves to the *latest* action on a
# contract, so once the contract has been called it reports ContractCall rather
# than ContractDeploy. Existence and deployment are therefore checked
# separately: the address must resolve on-chain, and the deploy transaction
# must contain a ContractDeploy for that same address. This keeps verification
# correct as the contract continues to be used.
set -euo pipefail

DEFAULT_ADDRESS='2c5b229e9092c0726cafcc7b856ef2f0ae301e25b3eb97b63881ed715fb2fe4e'
DEFAULT_DEPLOY_TX='492bc5bf9ff75df1d94c4977f52b8b1d9030180ffc7a812c1d4817ecb659dd70'

NETWORK="${1:-preview}"
ADDRESS="${2:-$DEFAULT_ADDRESS}"

# Only pair the recorded deploy transaction with the address it belongs to.
if [ "$#" -ge 3 ]; then
  DEPLOY_TX="$3"
elif [ "$ADDRESS" = "$DEFAULT_ADDRESS" ]; then
  DEPLOY_TX="$DEFAULT_DEPLOY_TX"
else
  DEPLOY_TX=''
fi

INDEXER="https://indexer.${NETWORK}.midnight.network/api/v4/graphql"

gql() {
  curl -sS -X POST "$INDEXER" -H 'Content-Type: application/json' -d "$1"
}

field() { sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p" <<<"$2"; }
height() { sed -n 's/.*"height":\([0-9]*\).*/\1/p' <<<"$1"; }

ACTION_QUERY=$(printf '{"query":"query { contractAction(address: \\"%s\\") { __typename address transaction { hash block { height } } } }"}' "$ADDRESS")
ACTION=$(gql "$ACTION_QUERY")

if ! grep -q '"__typename":"Contract' <<<"$ACTION"; then
  echo "Contract not found on ${NETWORK}."
  echo "$ACTION"
  exit 1
fi

echo "Network:  ${NETWORK}"
echo "Address:  $(field address "$ACTION")"

if [ -n "$DEPLOY_TX" ]; then
  DEPLOY_QUERY=$(printf '{"query":"query { transactions(offset: { hash: \\"%s\\" }) { hash block { height } contractActions { __typename address } } }"}' "$DEPLOY_TX")
  DEPLOY=$(gql "$DEPLOY_QUERY")

  if ! grep -q '"__typename":"ContractDeploy"' <<<"$DEPLOY" ||
    ! grep -q "\"address\":\"${ADDRESS}\"" <<<"$DEPLOY"; then
    echo
    echo "Transaction ${DEPLOY_TX} does not contain a ContractDeploy for this address."
    echo "$DEPLOY"
    exit 1
  fi

  echo "Deploy:   ContractDeploy in block $(height "$DEPLOY") (tx $(field hash "$DEPLOY"))"
fi

echo "Latest:   $(field __typename "$ACTION") in block $(height "$ACTION") (tx $(field hash "$ACTION"))"
echo
echo "Verified on-chain."
