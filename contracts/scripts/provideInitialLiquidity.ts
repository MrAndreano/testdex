import { NetworkProvider } from '@ton/blueprint';
import { Address, toNano } from '@ton/core';
import { cliConfig } from '../helpers/helpers';
import {
    JettonMinterContract,
    JettonWalletContract,
    color,
    getExpLink,
} from '../libs';
import { PoolCPI as Pool } from '../wrappers/Pool';
import { provideLpPayload, Router } from '../wrappers/Router';

const HOUR = 3600;

export async function run(provider: NetworkProvider) {
    cliConfig.readConfig();
    const config = cliConfig.values;

    if (!config.routerAddress) {
        throw new Error('routerAddress missing — run deploy:router first');
    }
    if (!config.tokenAlphaAddress || !config.tokenBetaAddress) {
        throw new Error('token addresses missing — run deploy:tokens first');
    }

    const sender = provider.sender();
    const user = sender.address as Address;
    const router = provider.open(Router.createFromAddress(config.routerAddress as Address));
    const tokenA = provider.open(
        JettonMinterContract.createFromAddress(config.tokenAlphaAddress as Address),
    );
    const tokenB = provider.open(
        JettonMinterContract.createFromAddress(config.tokenBetaAddress as Address),
    );

    const amountA = config.tokenAmount ?? toNano('10000');
    const amountB = config.tokenAmount ?? toNano('10000');

    const routerWalletA = await tokenA.getWalletAddress(router.address);
    const routerWalletB = await tokenB.getWalletAddress(router.address);

    const poolAddress = await router.getPoolAddress({
        firstWalletAddress: routerWalletA,
        secondWalletAddress: routerWalletB,
    });

    color.log(` - <y>TestDex: create pool + initial liquidity`);
    color.log(` - <y>Router: ${(config.routerAddress as Address).toString()}`);
    color.log(` - <y>Pool (computed): ${getExpLink(provider, poolAddress)}`);
    color.log(` - <y>Amounts: ${amountA.toString()} nano-TTA + ${amountB.toString()} nano-TTB`);

    const walletA = provider.open(
        JettonWalletContract.createFromAddress(await tokenA.getWalletAddress(user)),
    );
    const deadline = Math.floor(Date.now() / 1000) + HOUR;

    color.log(` - <y>Step 1/3: send TTA to router (first side)...`);
    await walletA.sendTransfer(sender, {
        value: toNano('0.35'),
        jettonAmount: amountA,
        toAddress: router.address,
        responseAddress: user,
        fwdAmount: toNano('0.25'),
        fwdPayload: provideLpPayload({
            otherTokenAddress: routerWalletB,
            minLpOut: 0n,
            refundAddress: user,
            excessesAddress: user,
            toAddress: user,
            deadline,
        }),
    });

    color.log(` - <y>Waiting 15s for async processing...`);
    await sleep(15000);

    const pool = provider.open(Pool.createFromAddress(poolAddress));
    if (!(await provider.isContractDeployed(pool.address))) {
        color.log(` - <y>Step 2/3: deploy pool contract with TON deposit...`);
        await pool.sendDeploy(sender, toNano('0.5'));
        await provider.waitForDeploy(pool.address, 120);
    } else {
        color.log(` - <g>Pool already deployed`);
    }

    color.log(` - <y>Step 3/3: send TTB to complete liquidity...`);
    const walletB = provider.open(
        JettonWalletContract.createFromAddress(await tokenB.getWalletAddress(user)),
    );
    await walletB.sendTransfer(sender, {
        value: toNano('0.35'),
        jettonAmount: amountB,
        toAddress: router.address,
        responseAddress: user,
        fwdAmount: toNano('0.25'),
        fwdPayload: provideLpPayload({
            otherTokenAddress: routerWalletA,
            minLpOut: 0n,
            refundAddress: user,
            excessesAddress: user,
            toAddress: user,
            bothPositive: true,
            deadline,
        }),
    });

    color.log(` - <g>Pool ready: ${pool.address.toString()}`);
    color.log(` - <g>Run: npm run export:config`);
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
