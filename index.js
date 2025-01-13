const keep_alive = require('./keep_alive.js')
const { Telegraf } = require('telegraf');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input'); // For reading input
const fs = require('fs');
const util = require('util');

// Utility function to read credentials from a file
function readCredentials() {
    return {
        apiId: 22573035,
        apiHash: '28fe44c4ac64ae8344641ee68d55af4f',
        phoneNumber: '+2349036259266',
    };
}

// Utility function to write credentials to a file
function writeCredentials(apiId, apiHash, phoneNumber) {
    const data = `${apiId}\n${apiHash}\n${phoneNumber}`;
    fs.writeFileSync('credentials.txt', data);
}

// Utility function to extract Sui contract addresses
function extractSuiAddresses(text) {
    const suiAddressRegex = /0x[0-9a-fA-F]{64}::[a-zA-Z0-9_]+::[a-zA-Z0-9_]+/g;
    const matches = text.match(suiAddressRegex) || [];
    return { matches, found: matches.length > 0 };
}

// Telegram Forwarder class
class TelegramForwarder {
    constructor(apiId, apiHash, phoneNumber) {
        this.apiId = apiId;
        this.apiHash = apiHash;
        this.phoneNumber = phoneNumber;
        this.client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 5 });
    }

    async connectClient() {
        while (true) {
            try {
                await this.client.connect();
                const isAuthorized = await this.client.checkAuthorization();
                if (!isAuthorized) {
                    await this.client.signInUser({ phoneNumber: this.phoneNumber });
                    const code = await input.text('Enter the code: ');
                    await this.client.signIn({ phoneNumber: this.phoneNumber, code });
                }
                console.log('Client connected successfully.');
                break;
            } catch (error) {
                console.error(`Error connecting client: ${error.message}. Retrying in 10 seconds...`);
                await new Promise((resolve) => setTimeout(resolve, 10000));
            }
        }
    }

    async listChats() {
        await this.connectClient();
        const dialogs = await this.client.getDialogs({});
        const chatData = dialogs.map((dialog) => `Chat ID: ${dialog.id}, Title: ${dialog.title || 'No Title'}`).join('\n');
        fs.writeFileSync(`chats_of_${this.phoneNumber}.txt`, chatData, 'utf-8');
        console.log('List of groups printed successfully!');
    }

    async getChats(keywords) {
        await this.connectClient();
        const dialogs = await this.client.getDialogs({});
        return dialogs.find((dialog) => keywords.some((keyword) => dialog.title?.toLowerCase().includes(keyword)));
    }

    async forwardMessagesToChannel(sourceChatId, destinationChannelId, keywords) {
        await this.connectClient();
        let lastMessageId = 0;
        const botIds = [7845011793, 7517160605, 5434266369, 609517172, 6868734170];
        const admins = await this.client.getParticipants(sourceChatId, { filter: 'administrators' });

        const adminDetails = admins.map((admin) => ({
            id: admin.id,
            name: admin.username || admin.firstName || 'No Name',
        }));

        const adminIds = adminDetails
            .map((admin) => admin.id)
            .filter((id) => !botIds.includes(id));

        console.log('Admin IDs:', adminIds);

        while (true) {
            try {
                console.log('Checking for messages and forwarding them...');
                const messages = await this.client.getMessages(sourceChatId, {
                    minId: lastMessageId,
                    limit: 10,
                });

                for (const message of messages.reverse()) {
                    if (message.message) {
                        const { matches: contractAddresses, found } = extractSuiAddresses(message.message);
                        const sender = await message.getSender();
                        if (found && sender && adminIds.includes(sender.id)) {
                            console.log('Message contains a contract address:', message.message);
                            const destination = await this.client.getEntity(destinationChannelId);
                            await this.client.sendMessage(destination, { message: contractAddresses.join('\n') });
                            console.log('Contract addresses forwarded:', contractAddresses);
                        } else {
                            console.log('No contract address in:', message.message);
                        }
                    }
                    lastMessageId = Math.max(lastMessageId, message.id);
                }

                await new Promise((resolve) => setTimeout(resolve, 5000));
            } catch (error) {
                console.error(`Error during message forwarding: ${error.message}. Retrying in 10 seconds...`);
                await new Promise((resolve) => setTimeout(resolve, 10000));
            }
        }
    }
}

async function main() {
    const { apiId, apiHash, phoneNumber } = readCredentials();

    if (!apiId || !apiHash || !phoneNumber) {
        console.log('Please provide valid API credentials.');
        process.exit(1);
    }

    const forwarder = new TelegramForwarder(apiId, apiHash, phoneNumber);
    const sourceChatId = -1002301121101;
    const destinationChannelId = '@nfd_sui_trade_bot';
    const keywords = [];

    while (true) {
        try {
            console.log('Hey Lex!!');
            await forwarder.forwardMessagesToChannel(sourceChatId, destinationChannelId, keywords);
        } catch (error) {
            console.error(`Unexpected error: ${error.message}. Restarting main loop in 10 seconds.`);
            await new Promise((resolve) => setTimeout(resolve, 10000));
        }
    }
}

main().catch((err) => console.error('Main error:', err));

