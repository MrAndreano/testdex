import 'dotenv/config';
import { run } from './mintAllTestTokens';

run().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
});
