import { Address } from '@ton/core';

export type GovernanceAccess = {
  hasKey: boolean;
  isRouterAdmin: boolean;
  canManageFeeRecipient: boolean;
  nftItems: string[];
  error?: string;
};

function tonApiBase(network: string): string {
  return network === 'testnet' ? 'https://testnet.tonapi.io' : 'https://tonapi.io';
}

export async function checkGovernanceNftOwnership(
  walletAddress: string,
  collectionAddress: string,
  network: string,
): Promise<{ hasKey: boolean; items: string[]; error?: string }> {
  try {
    const wallet = Address.parse(walletAddress).toRawString();
    const collection = Address.parse(collectionAddress).toRawString();
    const url = `${tonApiBase(network)}/v2/accounts/${wallet}/nfts?collection=${collection}&limit=10`;
    const res = await fetch(url);
    if (!res.ok) {
      return { hasKey: false, items: [], error: `TonAPI ${res.status}` };
    }
    const json = (await res.json()) as { nft_items?: { address: string }[] };
    const items = (json.nft_items ?? []).map((i) => i.address);
    return { hasKey: items.length > 0, items };
  } catch (e: unknown) {
    return {
      hasKey: false,
      items: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function resolveGovernanceAccess(
  cfg: {
    network: string;
    adminAddress: string;
    governanceNftCollectionAddress?: string;
    feeGovernorAddress?: string;
  },
  walletAddress: string | undefined,
  governorIsHolder?: boolean,
): Promise<GovernanceAccess> {
  if (!walletAddress) {
    return { hasKey: false, isRouterAdmin: false, canManageFeeRecipient: false, nftItems: [] };
  }

  let isRouterAdmin = false;
  try {
    isRouterAdmin = Address.parse(walletAddress).equals(Address.parse(cfg.adminAddress));
  } catch {
    /* ignore */
  }

  let hasKey = false;
  let nftItems: string[] = [];
  let error: string | undefined;

  if (cfg.governanceNftCollectionAddress) {
    const nft = await checkGovernanceNftOwnership(
      walletAddress,
      cfg.governanceNftCollectionAddress,
      cfg.network,
    );
    hasKey = nft.hasKey;
    nftItems = nft.items;
    error = nft.error;
  }

  if (cfg.feeGovernorAddress && governorIsHolder) {
    hasKey = true;
  }

  return {
    hasKey,
    isRouterAdmin,
    canManageFeeRecipient: isRouterAdmin || hasKey,
    nftItems,
    error,
  };
}
