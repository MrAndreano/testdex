import 'dotenv/config';
import { createTestDexProvider } from './testnetProvider';
import { run as deployRouter } from './deployRouter';
import { run as deployTestTokens } from './deployTestTokens';
import { run as provideInitialLiquidity } from './provideInitialLiquidity';

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

async function main() {
    process.env.TESTDEX_AUTO_CONFIRM = '1';
    const step = process.argv.find((a) => a.startsWith('--step='))?.split('=')[1] ?? 'all';
    const p = await createTestDexProvider();

    if (step === 'router' || step === 'all') {
        console.log('>> deployRouter');
        await deployRouter(p, ['constant_product']);
    }
    if (step === 'tokens' || step === 'all') {
        console.log('>> deployTestTokens');
        await deployTestTokens(p);
    }
    if (step === 'liquidity' || step === 'all') {
        if (step === 'all') {
            console.log('>> waiting 30s...');
            await sleep(30000);
        }
        console.log('>> provideInitialLiquidity');
        await provideInitialLiquidity(p);
    }
    process.exit(0);
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
});
