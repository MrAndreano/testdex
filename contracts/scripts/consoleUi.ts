import type { Address } from '@ton/core';
import type { UIProvider } from '@ton/blueprint';

export class ConsoleUIProvider implements UIProvider {
    write(message: string) {
        process.stdout.write(message);
    }

    async prompt(_message: string) {
        return process.env.TESTDEX_AUTO_CONFIRM === '1';
    }

    async inputAddress(_message: string, fallback?: Address) {
        if (!fallback) throw new Error('inputAddress: fallback required in auto mode');
        return fallback;
    }

    async input(_message: string) {
        return '';
    }

    async choose<T>(_message: string, choices: T[], _display: (v: T) => string) {
        return choices[0];
    }

    setActionPrompt(_message: string) {}

    clearActionPrompt() {}
}
