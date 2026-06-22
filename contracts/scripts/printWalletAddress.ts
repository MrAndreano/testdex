import 'dotenv/config';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { WalletContractV5R1 } from '@ton/ton';

async function main() {
    const mnemonic = process.env.WALLET_MNEMONIC ?? '';
    const kp = await mnemonicToPrivateKey(mnemonic.split(' '));

    const mainnet = WalletContractV5R1.create({ publicKey: kp.publicKey });
    const testnet = WalletContractV5R1.create({
        publicKey: kp.publicKey,
        walletId: {
            networkGlobalId: -3,
            context: { workchain: 0, walletVersion: 'v5r1', subwalletNumber: 0 },
        },
    });

    console.log('mainnet default (-239):', mainnet.address.toString());
    console.log('testnet (-3):       ', testnet.address.toString());
}

main();
