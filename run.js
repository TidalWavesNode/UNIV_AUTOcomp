
//require('dotenv').config({ path: '.env.local' })
require('dotenv').config()

require('./src/app').start(process.env.MOLARIS_AVAX_ENDPOINT_MAINNET,
                       process.env.WALLET_PRIVATE_MNEMONIC,
                       process.env.WALLET_DERIVATION_PATH);
