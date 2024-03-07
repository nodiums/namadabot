const { exec } = require('child_process');
const fs = require('fs');
const toml = require('toml');
const request = require('request-promise');

function executeCommand(command, callback) {
    exec(command, (error, stdout, stderr) => {
        if (error) {
            callback(error, null);
            return;
        }
        if (stderr) {
            callback(stderr, null);
            return;
        }
        callback(null, stdout.trim());
    });
}

const configPath = 'config.toml';
const config = toml.parse(fs.readFileSync(configPath, 'utf-8'));

async function sendTelegramMessage(message) {
    try {
        const response = await request.post(`https://api.telegram.org/bot${config.bot_token}/sendMessage`, {
            form: {
                chat_id: config.chat_id,
                text: message,
            },
        });
        console.log('Telegram response:', response);
    } catch (error) {
        console.error('Error sending message to Telegram:', error);
    }
}

const rpc = config.rpc;
const operator = config.operator;
const botToken = config.bot_token;
const missNotification = parseInt(config.miss_notification);
const expectedChainId = config.chain_id;

let missCounter = 0;
let lastBlockHeight = 0;
let tendermintKey = '';

async function checkNamadacBinary() {
    try {
        const command = 'namadac --version';
        await executeCommandAsync(command);
        console.log('Namadac binary found');
    } catch (error) {
        console.error('Namadac binary not found.');
        process.exit(1);
    }
}

async function getTendermintKey() {
    try {
        const command = `namadac find-validator --node "http://localhost:26657" --validator ${operator}`;
        const output = await executeCommandAsync(command);
        
        if (output.includes('Tendermint key:')) {
            const keyMatch = output.match(/Tendermint key: (.*)/);
            tendermintKey = keyMatch ? keyMatch[1].trim() : '';
            console.log('Tendermint key:', tendermintKey);
        } else {
            console.error("We can't find your Tendermint key, check your rpc or operator address");
            process.exit(1);
        }
    } catch (error) {
        console.error('Error occurred while getting Tendermint key:', error);
        process.exit(1);
    }
}

async function executeCommandAsync(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            if (stderr) {
                reject(stderr);
                return;
            }
            resolve(stdout.trim());
        });
    });
}

async function checkRpcNetwork() {
    try {
        const response = await request(`${rpc}/status`, { json: true });
        const catchingUp = response.result.sync_info.catching_up;
        const latestHeight = response.result.sync_info.latest_block_height;

        if (!catchingUp) {
            console.log(`Node is synced. Latest node height: ${latestHeight}`);
        } else {
            console.error(`Node is not synced. Latest height: ${latestHeight}`);
            process.exit(1);
        }

        const network = response.result.node_info.network;

        if (network !== expectedChainId) {
            console.error(`RPC has wrong Network. Expected ${expectedChainId} from config, got ${network} from RPC.`);
            process.exit(1);
        } else {
            console.log(`RPC Network is correct. Expected ${expectedChainId}`);
        }
    } catch (error) {
        console.error('Error occurred while checking RPC network:', error);
        process.exit(1);
    }
}

async function checkBlocks() {
    try {
        let latestHeightResponse = await request(`${config.rpc}/status`, { json: true });
        let latestHeight = latestHeightResponse.result.sync_info.latest_block_height;

        if (latestHeight !== lastBlockHeight) {
            if (!lastBlockHeight) {
                console.log(`Start check height - ${latestHeight - 100}, latest height - ${latestHeight}`);
                lastBlockHeight = latestHeight;

                const missedBlocks = []; 

                for (let i = latestHeight - 100; i <= latestHeight; i++) {
                    const blockResponse = await request(`${config.rpc}/block?height=${i}`, { json: true });
                    const validatorAddresses = blockResponse.result.block.last_commit.signatures.map(sig => sig.validator_address);
                    if (!validatorAddresses.includes(tendermintKey)) {
                        missedBlocks.push(i);
                    }
                }

                console.log(`Missed blocks in the last 100: ${missedBlocks.length}, Missed blocks: [${missedBlocks.join(', ')}]`);
                missCounter = missedBlocks.length;

                if (missCounter >= parseInt(config.miss_notification)) {
                    const message = `${config.operator} missed ${missCounter} blocks: [${missedBlocks.join(', ')}]`;
                    sendTelegramMessage(message);
                    missCounter = 0; 
                }
            }
        }

        let startTime; 

        while (true) {
            startTime = Date.now(); 
            process.stdout.write('Waiting for new block...'); 
            let elapsedTime = 0; 
            while (latestHeight === (await request(`${config.rpc}/status`, { json: true })).result.sync_info.latest_block_height) {
                await sleep(100); 
                elapsedTime += 0.1; 
                process.stdout.clearLine(); 
                process.stdout.cursorTo(0); 
                process.stdout.write(`Waiting for new block... Elapsed time: ${elapsedTime.toFixed(1)} seconds`);
            }

            console.log(''); 

            latestHeight = (await request(`${config.rpc}/status`, { json: true })).result.sync_info.latest_block_height;
            const blockResponse = await request(`${config.rpc}/block?height=${latestHeight}`, { json: true });
            const validatorAddresses = blockResponse.result.block.last_commit.signatures.map(sig => sig.validator_address);

            if (!validatorAddresses.includes(tendermintKey)) {
                missCounter++;
            } else {
                missCounter = 0; 
            }

            console.log(`New block: Height - ${latestHeight}, Signed by validator: ${validatorAddresses.includes(config.tendermint_key)}, Miss counter: ${missCounter}`);

            if (missCounter >= parseInt(config.miss_notification)) {
                const message = `${config.operator} missed ${missCounter} blocks.`;
                sendTelegramMessage(message);
            }
        }
    } catch (error) {
        console.error('Error occurred while checking blocks:', error);
    }
}



function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
checkNamadacBinary().then(() => {
    checkRpcNetwork().then(() => {
        getTendermintKey().then(() => {
            checkBlocks(); 
        });
    });
});
