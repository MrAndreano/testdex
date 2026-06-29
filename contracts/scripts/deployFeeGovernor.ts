import { NetworkProvider } from '@ton/blueprint';
import { Address, toNano } from '@ton/core';
import { compile } from '@ton/blueprint';
import { cliConfig } from '../helpers/helpers';
import { color, getExpLink } from '../libs';
import { FeeGovernor } from '../wrappers/FeeGovernor';

export async function run(provider: NetworkProvider) {
    cliConfig.readConfig();
    const config = cliConfig.values;

    if (!config.routerAddress) {
        throw new Error('routerAddress missing — run deploy:router first');
    }

    const sender = provider.sender();
    const owner = (config.adminAddress as Address | null) ?? (sender.address as Address);
    const router = config.routerAddress as Address;

    const code = await compile('FeeGovernor');
    const governor = provider.open(
        FeeGovernor.createFromConfig({ routerAddress: router, ownerAddress: owner }, code),
    );

    color.log(` - <y>TestDex: deploy FeeGovernor`);
    color.log(` - <y>Router: ${router.toString()}`);
    color.log(` - <y>Owner (adds key holders): ${owner.toString()}`);
    color.log(` - <y>Governor (computed): ${getExpLink(provider, governor.address)}`);

    await governor.sendDeploy(sender, toNano('0.05'));
    await provider.waitForDeploy(governor.address, 120);

    color.log(` - <g>FeeGovernor: ${governor.address.toString()}`);
    color.log(` - <y>Next: npm run setup:governor-holder -- <wallet>`);
    color.log(` - <y>Then transfer router admin to governor (init_admin_upgrade, 2d timelock)`);
    color.log(` - <y>Add feeGovernorAddress to testnet.json and export:config`);
}
