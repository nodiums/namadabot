# namadabot
This tool helps to track liveness of namada validator

## Configuration

Adjust `config.toml` with your data. It is recommended to run this along with validator rpc.

- `operator = "tnam1qxcudgqkf03hfuv43zjfe76julypzdwxyggjjhk2"`: Address of your validator.
- `rpc = "http://localhost:26657"`: RPC you trust. It's better to use validators.
- `bot_token = "Your Telegram Bot Token"`: Get it with @BotFather.
- `chat_id='chai_id'`: Your Telegram ID.
- `miss_notification = "1"`: Total blocks misses count after which you want to get a notification.
- `chain_id = "shielded-expedition.88f17d1d14"`: To make sure you are using the correct provider.

## Installation

Make sure you have namada binary at your env.
You can install the necessary dependencies using npm:

```bash
npm install toml request-promise

## Retrieve Tendermint Key

The script retrieves the Tendermint key associated with the provided operator address:

- If the command is successful and returns the Tendermint key, it proceeds with the key.


## Continuous Block Checking

After ensuring the Namadac binary existence and checking the RPC network, the script proceeds to continuous block checking:

- It first checks the latest 100 blocks to identify any missed blocks by comparing the validator addresses in the block's last commit with the Tendermint key.
- Upon completion, the script subscribes to new blocks, continuously monitoring for them.
