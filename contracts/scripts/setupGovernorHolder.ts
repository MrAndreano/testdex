import { NetworkProvider } from '@ton/blueprint';
import { Address } from '@ton/core';
import { compile } from '@ton/blueprint';
import { cliConfig } from '../helpers/helpers';
import { color } from '../libs';
import { FeeGovernor } from '../wrappers/FeeGovernor';

export async function run(provider: NetworkProvider) {
    cliConfig.readConfig();
    const config = cliConfig.values;

    const holderArg = process.argv.find((a) => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1]);
    const holderRaw = holderArg ?? process.argv[process.argv.length - 1];
    if (!holderRaw || holderRaw.includes('setup:governor')) {
        throw new Error('Usage: npm run setup:governor-holder -- EQ...wallet');
    }

    const governorAddress = config.feeGovernorAddress as Address | null;
    if (!governorAddress) {
        throw new Error('feeGovernorAddress missing in deploy.config.json — run deploy:governor first');
    }

    const holder = Address.parse(holderRaw);
    const sender = provider.sender();
    const code = await compile('FeeGovernor');
    const governor = provider.open(FeeGovernor.createFromAddress(governorAddress));

    color.log(` - <y>FeeGovernor add key holder: ${holder.toString()}`);

    await governor.sendAddHolder(sender, { holder });

    const isHolder = await governor.isHolder(holder);
    color.log(isHolder ? ` - <g>Holder registered on-chain` : ` - <r>Registration pending — wait and retry is_holder`);
}
