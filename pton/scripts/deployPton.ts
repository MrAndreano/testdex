import 'dotenv/config';
import { createTestDexProvider } from '../../contracts/scripts/testnetProvider';
import { run as deployMinter } from './deployMinter';

async function main() {
    process.env.TESTDEX_AUTO_CONFIRM = '1';
    console.log('=== TestDex pTON deploy ===\n');
    const provider = await createTestDexProvider();
    await deployMinter(provider);
    console.log('\n=== pTON deploy done ===');
    process.exit(0);
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
});
