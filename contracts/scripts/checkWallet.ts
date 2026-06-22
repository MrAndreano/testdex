import 'dotenv/config';
import { getConfig } from '@ton/blueprint/dist/config/utils';
import { TonClient } from '@ton/ton';
import { createTestnetW5Sender } from './testnetW5Sender';
import { ConsoleUIProvider } from './consoleUi';

async function main() {
    const config = await getConfig();
    const net = config?.network;
    if (!net || typeof net === 'string') {
        throw new Error('blueprint.config.ts: задайте ENDPOINT_URL в .env');
    }

    const client = new TonClient({ endpoint: net.endpoint, apiKey: net.key, timeout: 120000 });
    const ui = new ConsoleUIProvider();
    await createTestnetW5Sender(client, ui);
    ui.write('\nКошелёк готов к деплою.\n');
    process.exit(0);
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
});
