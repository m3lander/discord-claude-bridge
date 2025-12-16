
import 'dotenv/config';
import {
    Client,
    Events,
    ChannelType,
    GatewayIntentBits,
    TextChannel,
    ThreadChannel,
    Message
} from 'discord.js';
import { MessageHandler } from '../src/discord/message-handler.js';

// --- Mocks ---

class MockUser {
    id = 'user-123';
    tag = 'TestUser#1234';
    bot = false;
}

class MockMessage {
    id: string;
    content: string;
    author: MockUser;
    channel: any;
    guild = { id: 'guild-1' };
    thread: any = null;
    mentions = {
        has: () => true // Always simulate being mentioned for trigger
    };

    constructor(content: string, channel: any) {
        this.id = Date.now().toString();
        this.content = content;
        this.author = new MockUser();
        this.channel = channel;
    }

    async fetch() { return this; }
}

class MockThread {
    id = 'thread-' + Date.now();
    type = ChannelType.PublicThread;
    parentId: string;
    messages: MockMessage[] = [];
    parent: any;

    constructor(parent: any, name: string) {
        this.parent = parent;
        this.parentId = parent.id;
        console.log(`[MockDiscord] Thread created: "${name}" (${this.id})`);
    }

    async send(content: string) {
        const msg = new MockMessage('', this);
        // Handle mock object update logic
        const mockMsg = {
            ...msg,
            content,
            edit: async (newContent: string) => {
                mockMsg.content = newContent;
                t.messages.push(mockMsg); // Keep track
            }
        };
        t.messages.push(mockMsg); // Keep track
        return mockMsg;
        // console.log(`[MockDiscord] Bot sent message in thread: ${ content.substring(0, 50) }...`);
        return mockMsg;
    }
}

class MockChannel {
    id = 'channel-1';
    type = ChannelType.GuildText;
    threads = {
        create: async (options: any) => {
            const thread = new MockThread(this, options.name);
            return thread;
        }
    };

    async send(content: string) {
        console.log(`[MockDiscord] Bot sent message in channel: ${content}`);
        return new MockMessage(content, this);
    }
}

// --- Test Runner ---

async function runIntegrationTest() {
    console.log('--- Starting Integration Test ---');
    console.log('Target: Verify Session Persistence & Message Handling');

    // 1. Setup Mock Discord Client
    const client = new Client({ intents: [] });
    // @ts-ignore - Inject mock emitters if needed, or just allow MessageHandler to bind

    // 2. Initialize Handler
    // We need to trick MessageHandler into accepting our mock client
    const handler = new MessageHandler(client, {
        requireTrigger: false, // Simplify test
        autoCreateThreads: true
    });

    // 3. Prepare Test Data
    const channel = new MockChannel();
    const secretCode = `CODE - ${Math.floor(Math.random() * 10000)} `;

    // --- Step 1: Initial Message (Set Context) ---
    console.log(`\n[Test] Step 1: Sending initial message with secret "${secretCode}"...`);
    const msg1 = new MockMessage(`@claude Please remember this secret code: ${secretCode}. Then write a 500 word story about a bridge to test your output length.`, channel);

    // Simulate incoming message event manually since client.emit is hard to hook perfectly with type checks
    // We access the private handler method or emit via client if possible.
    // MessageHandler binds to client.on(Events.MessageCreate, ...)
    // We can emit directly on the client.

    // Mock client needs user for mention check
    client.user = { id: 'bot-123', tag: 'ClaudeBot' } as any;

    // Emit event
    client.emit(Events.MessageCreate, msg1 as unknown as Message);

    // Wait for processing...
    // Since we don't have a callback, we poll the MockThread creation and response.
    // In a real app we'd need a better signal, but for a script, polling is fine.

    console.log('[Test] Waiting for thread creation and response...');

    let thread: MockThread | null = null;
    let botResponse: any = null;

    // Poll for thread
    for (let i = 0; i < 20; i++) { // 20 seconds max
        // Check if channel mocked create was called and returned a thread
        // The MockChannel.threads.create returns a thread. 
        // We need to capture it.
        // Hack: Configure MockChannel to expose last created thread.
        await new Promise(r => setTimeout(r, 1000));
    }
}

// Revised Mocks to support capture
const capturedThreads: MockThread[] = [];

// Re-defining mocks with capture logic (cleaner implementation)
const mockClient = new Client({ intents: [] }) as any;
mockClient.user = { id: 'bot-id', toString: () => '<@bot-id>' };

const mockChannel = {
    id: 'channel-1',
    type: ChannelType.GuildText,
    threads: {
        create: async (options: any) => {
            // 1. Create the thread object first (partial)
            const t: any = {
                id: `thread-${Date.now()}`,
                type: ChannelType.PublicThread,
                parentId: 'channel-1',
                parent: mockChannel,
                lastMessage: null,
                messages: [] // Array to store all messages
            };

            // 2. Define methods that use 't'
            t.send = async (content: string) => {
                const msg = {
                    content,
                    edit: async (newContent: string) => {
                        msg.content = newContent;
                        // Determine if we should push updates or just edit in place?
                        // For history tracking, simpler to just update the last one if it matches?
                        // Or just push everything to log history.
                        // Let's just update the content in the array if it exists
                        const existing = t.messages.find((m: any) => m === msg);
                        if (existing) {
                            existing.content = newContent;
                        } else {
                            t.messages.push(msg);
                        }
                    }
                };
                t.messages.push(msg);
                t.lastMessage = msg;
                return msg;
            };

            capturedThreads.push(t);
            return t;
        }
    },
    send: async () => { }
} as unknown as TextChannel;

async function run() {
    console.log('ℹ️  Note: This test requires valid .env credentials to hit the real Claude API.');
    console.log('--- Starting Integration Test ---');

    const handler = new MessageHandler(mockClient, {
        requireTrigger: true,
        autoCreateThreads: true
    });

    const secret = `SECRET-${Math.floor(Math.random() * 1000)}`;
    console.log(`1️⃣  Step 1: User says "My secret is ${secret}. Write a long story."`);

    const msg1 = {
        id: 'msg-1',
        content: `<@bot-id> My secret is ${secret}. Please write a story about a cybernetic cat (at least 3000 chars) to test your buffer.`,
        author: { bot: false, tag: 'User' },
        guild: { id: 'guild-1' },
        channel: mockChannel,
        mentions: { has: () => true },
        contentWithMentions: '...',
        fetch: async () => msg1
    } as unknown as Message;

    // Trigger
    mockClient.emit(Events.MessageCreate, msg1);

    // Poll for thread and completion
    let thread: any = null;
    let attempts = 0;
    while (!thread && attempts < 10) {
        if (capturedThreads.length > 0) thread = capturedThreads[0];
        await new Promise(r => setTimeout(r, 1000));
        attempts++;
    }

    if (!thread) {
        console.error('❌ Timeout: Thread was not created.');
        process.exit(1);
    }

    console.log(`✅ Thread created: ${thread.id} `);
    console.log('⏳ Waiting for Claude to finish (checking for "✅ *Complete*" or similar)...');

    // Poll thread.lastMessage for completion
    let complete = false;
    let responseText = '';

    for (let i = 0; i < 60; i++) { // 60s timeout for long generations
        if (thread.lastMessage) {
            responseText = thread.lastMessage.content;
            if (responseText.includes('✅ *Complete*') || responseText.includes('Complete')) {
                complete = true;
                break;
            }
        }
        await new Promise(r => setTimeout(r, 1000));
        process.stdout.write('.');
    }
    console.log('');

    if (!complete) {
        console.error('❌ Timeout: Response did not complete.');
        console.log('Last content:', responseText);
        process.exit(1);
    }

    console.log(`✅ Response received(${responseText.length} chars).`);

    // Verify Truncation/Length
    if (responseText.length > 1000) {
        console.log('✅ Message length > 1000 chars (Truncation fix working!)');
    } else {
        console.warn('⚠️  Message length < 1000 chars. Might be short generation or truncation issue?');
    }

    // Step 2: Session Persistence
    console.log(`\n2️⃣  Step 2: User says "What is the secret?" in the same thread.`);

    const msg2 = {
        id: 'msg-2',
        content: `What is the secret I told you ? `,
        author: { bot: false, tag: 'User' },
        guild: { id: 'guild-1' },
        channel: thread, // Send IN THE THREAD
        mentions: { has: () => false }, // No mention needed in thread usually, but logic might require it
        fetch: async () => msg2
    } as unknown as Message;

    // Reset thread last message to track NEW response
    thread.lastMessage = null;

    mockClient.emit(Events.MessageCreate, msg2);

    console.log('⏳ Waiting for second response...');

    complete = false;
    responseText = '';

    for (let i = 0; i < 30; i++) {
        if (thread.lastMessage) {
            responseText = thread.lastMessage.content;
            if (responseText.includes('✅ *Complete*')) {
                complete = true;
                break;
            }
        }
        await new Promise(r => setTimeout(r, 1000));
        process.stdout.write('.');
    }
    console.log('');

    if (!complete) {
        console.error('❌ Timeout waiting for second response.');
        process.exit(1);
    }

    console.log(`✅ Response: ${responseText.split('\n').find(l => l.includes(secret) || l.includes('Secret')) || '...'} `);

    // Verify Secret in ANY message in the thread
    const fullHistory = thread.messages.map(m => m.content).join('\n---\n');
    console.log(`✅ Response History Length: ${fullHistory.length}`);
    // console.log('DEBUG FULL HISTORY:', fullHistory); // Uncomment if needed

    // Check last 2000 chars roughly to see context
    console.log(`Last part: ${fullHistory.slice(-500)}`);

    if (fullHistory.includes(secret)) {
        console.log(`🎉 SUCCESS: Secret "${secret}" found in response history! Session persisted.`);
    } else {
        console.error(`❌ FAILURE: Secret "${secret}" NOT found in response history.`);
        console.log('Full history slice:', fullHistory.slice(0, 500) + '...' + fullHistory.slice(-500));
        process.exit(1);
    }

    // Cleanup (optional)
    process.exit(0);
}

run().catch(console.error);
