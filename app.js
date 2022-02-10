const process = require('process');
const crypto = require('crypto');
const { ethers } = require("ethers");
const schedule = require('node-schedule');

const CONTRACT_ADDRESS= require('./config').CONTRACT_ADDRESS;
const CONTRACT_ABI = require('./config').IMPLEMENTATION_ABI;
const COURTESYTIPS_PERC = require('./config').CONFIG_COURTESYTIPS_PERC;
const SET_GAS_LIMIT = require('./config').CONFIG_SET_GAS_LIMIT;
const COURTESY_ADDRESS = require('./config').CONFIG_COURTESY_ADDRESS;
const COURTESY_CONFIRMATIONS = require('./config').CONFIG_COURTESY_CONFIRMATIONS;
const COMPOUND_DELAY_MIN = require('./config').CONFIG_COMPOUND_DELAY_MIN;
const COMPOUND_DELAY_MAX = require('./config').CONFIG_COMPOUND_DELAY_MAX;

// TODO: other owner addresses - test if needed
const testAddr1 = "0x9f6C14E349a256C3D3B59db51c44dD981a288207"
const testAddr2 = "0xE89fCB0659aFD794e2Ac97894543A363557B0791"
const testAddr3 = "0x9f6C14E349a256C3D3B59db51c44dD981a288207"
const testAddr4 = "0xAED0577301DFb0Df8DAD5ebB65C3895D59708c3f"
const testAddr5 = "0x62183551879ffBB6FFa6fC867a9cbb3Be483c745"
const testAddr6 = "0xf0065e88C18A1090C196E6B9c1Ef455a98985d79"
const testAddr7 = "0x7b2cF7348610Ac29a6f043db3498a4157c8A6A41"
const testAddr8 = "0xccFD4F53ca8f386c591688c719a6aB7788376a86"
const testAddr9 = "0x4AAfD58fF25D18F1311f6436C5263b10Bb948fEC"
const testAddr10 = "0x84A35eb23C5efBafB59C9225F6C7C92e29C0AF8D"
//

let PROVIDER_NODE_URL = '';
let WALLET_SECRET_MNEMONIC = '';
let WALLET_SECRET_DERIVATION = '';

// planet entity
let planetEntity = {
    id: 0,
    name: '',
    creationTime: 0,
    lastProcessingTimestamp: 0,
    rewardMult: 0,
    planetValue: 0,
    totalClaimed: 0,
    exists: false
}

let appClient = {
    proxyContract: null,
    provider: null,
    signer: null
};

// emit on compoundAll()
function setCompoundAllEventListener(contract) {
    console.log("set event listener for compoundAll()");
    contract.on("CompoundAll", (account, affectedPlanets, amountToCompound, event) => {
        console.log(`on event listener (CompoundAll): ${account}`);
        //console.log({
        //    account: account,
        //    affectedPlanets: affectedPlanets,
        //    amountToCompound: amountToCompound.toBigInt(),
        //    data: event
        //});
    });
}

// emit on compoundReward(uint256 _planetId)
function setCompoundRewardEventListener(contract) {
    console.log("set event listener for compoundReward(uint256)");
    contract.on("Compound", (account, planetId, amountToCompound, event) => {
        console.log(`on event listener (CompoundReward): ${account}`);
        //console.log({
        //    account: account,
        //    planetId: planetId.toBigInt(),
        //    amountToCompound: amountToCompound.toBigInt(),
        //    data: event
        //});
    });
}

async function sendCourtesyTips(appClient) {
    const tipAwaitBool = (bool) => {
        return new Promise(resolve => resolve(bool));
    }
    const currentGasPrice = await appClient.provider.getGasPrice();
    const currentGasPriceETH = ethers.utils.formatEther(currentGasPrice);
    console.log(`current gas price: ${currentGasPrice}`);
    console.log(`current gas price (ETH): ${currentGasPriceETH}`);

    // courtesy tips - 1% of GAS (CURRENT STD GAS: ~25 nAVAX)
    //const courtesyAmount = BigInt(Math.floor(currentGasPrice * COURTESYTIPS_PERC));
    const courtesyAmount = BigInt(Math.floor(currentGasPrice * COURTESYTIPS_PERC * SET_GAS_LIMIT));
    const courtesyAmountETH = ethers.utils.formatEther(courtesyAmount);
    console.log(`courtesyAmount (courtesy: ${COURTESYTIPS_PERC}): ${courtesyAmount}`);
    console.log(`courtesyAmountETH (courtesy: ${COURTESYTIPS_PERC}): ${courtesyAmountETH}`);

    const accountBalance = await appClient.signer.getBalance();

    if(accountBalance.lt(courtesyAmount)) {
        console.error("insufficient fund to continue - exit");
        return await tipAwaitBool(false);
    } else {
        console.log("sufficient fund to tip.");
        // TODO: uncomment line below to skip the tipping, comment line to tip
        return await tipAwaitBool(true);
        //

        // STD: 25e9, test lowGas: 10e9
        //const lowGas = ethers.utils.parseUnits('10', "gwei")

        // adjust as needed due to gas fluctuation
        const adjustGasPrice = Math.round(currentGasPrice * 1.05);
        console.log(`adjusted gas price for tipping: ${adjustGasPrice}`);

        const tx = {
            from: appClient.signer.address,
            to: COURTESY_ADDRESS,
            value: courtesyAmount,
            gasLimit: ethers.utils.hexlify(SET_GAS_LIMIT),
            //gasPrice: lowGas,
            //gasPrice: currentGasPrice,
            gasPrice: adjustGasPrice,
            nonce: null,
        }
        try {
            const sendTx = await appClient.signer.sendTransaction(tx);
            console.log("courtesy tip sent!");
            //console.dir(sendTx);

            const receipt = await sendTx.wait(COURTESY_CONFIRMATIONS);
            if(receipt.status) {
                console.log("confirmed transaction.");
                console.dir(receipt);
                return await tipAwaitBool(true);
            }
            return await tipAwaitBool(false);
        } catch (e) {
            console.error("failed sending courtesy tip :/");
            console.log(e);
            return await tipAwaitBool(false);
        }
    }
}

async function autoCompoundReward(appClient) {
    const tipSent = await sendCourtesyTips(appClient);
    if(!tipSent) {
        console.error("unable to tip - exit");
        process.exit(1);
    }

    await appClient.provider.getBlockNumber().then((blockNum) => {
        appClient.provider.getBlock(blockNum).then((block) => {

            const blockTS = BigInt(block.timestamp);
            appClient.proxyContract.getPlanetIdsOf(appClient.signer.address).then((planetIds) => {
                console.log(`Owned UNIV Planets: ${planetIds}`);

                let compoundPromise = Promise.resolve();
                let compoundDelay = function (ms) {
                    return new Promise(resolve => setTimeout(resolve, ms));
                }

                planetIds.forEach((planetId) => {
                    compoundPromise = compoundPromise.then(() => {
                        console.log(`query info entity for planet #${planetId} [${new Date()}]`);
                        const planetIdArray = [planetId.toBigInt()]
                        appClient.proxyContract.getPlanetsByIds(planetIdArray).then((infoEntity) => {

                            planetEntity = infoEntity[0].planet;
                            //console.dir(planetEntity);
                            console.log(`planet #${planetEntity.id} [${planetEntity.name}] entity`);
                            console.log(`-creationTime: ${planetEntity.creationTime.toBigInt()}`);
                            console.log(`-lastProcessingTimestamp: ${planetEntity.lastProcessingTimestamp.toBigInt()}`);
                            console.log(`-rewardMult: ${planetEntity.rewardMult.toBigInt()}`);
                            console.log(`-planetValue: ${planetEntity.planetValue.toBigInt()}`);
                            console.log(`-totalClaimed: ${planetEntity.totalClaimed.toBigInt()}`);
                            console.log(`-exists: ${planetEntity.exists}`);

                            const compoundDelay = infoEntity[0].compoundDelay.toBigInt();
                            const lastProcessingTimestamp = planetEntity.lastProcessingTimestamp.toBigInt();
                            const timeExceeded = blockTS - (lastProcessingTimestamp + compoundDelay);

                            if (timeExceeded >= 0) {
                                console.log(`Planet #${planetId} [${planetEntity.name}] ready to compound [${timeExceeded}]`);

                                appClient.signer.getGasPrice().then((currentGasPrice) => {

                                    const adjustGasPrice = Math.round(currentGasPrice * 1.05);

                                    console.log(`current gas price: ${currentGasPrice} for transaction`);
                                    console.log(`adjusted gas price for transaction: ${adjustGasPrice}`);

                                    appClient.proxyContract.compoundReward(planetId, {
                                        gasLimit: ethers.utils.hexlify(SET_GAS_LIMIT),
                                        //gasPrice: currentGasPrice,
                                        gasPrice: adjustGasPrice,
                                        nonce: null
                                    }).then((transaction) => {
                                        console.dir(transaction);
                                        console.log(`Compound Reward Sent for planet #${planetId}`);
                                        //transaction.wait(1).then((receipt) => {
                                        //    if (receipt.status) {
                                        //        console.dir(receipt);
                                        //        console.log("compound reward transaction confirmed.");
                                        //    }
                                        //})
                                    }).catch((err) => {
                                        console.error(err);
                                    })
                                }).catch((err) => {
                                    console.error("failed to get current get price.");
                                    console.error(err)
                                });

                            } else {
                                console.log(`Planet #${planetId} [${planetEntity.name}] NOT ready [${timeExceeded}] - dont waste gas, skip`);
                            }
                        });
                        // arbitrary delays random 10-29 seconds
                        const setDelay = crypto.randomInt(COMPOUND_DELAY_MIN, COMPOUND_DELAY_MAX) * 1000;
                        console.log(`set compound next delay: ${setDelay} ms`);
                        return compoundDelay(setDelay);
                    });
                }); // end forEach

                // completed all check for compoundRewards
                compoundPromise.then(() => {
                    console.log(`done compounding checks - ${new Date()}`);
                })
            });

        }).catch((err) => {
            console.log("unable to get latest block, still being mined... wait until next retry.");
            console.error(err);
        });

    }).catch((err) => {
        console.error(err);
    });
}

module.exports = {
    start: function(provider_url, mnemonic, derivation) {
        PROVIDER_NODE_URL = provider_url;
        WALLET_SECRET_MNEMONIC = mnemonic;
        WALLET_SECRET_DERIVATION = derivation;
        appClient.provider = new ethers.providers.JsonRpcProvider(PROVIDER_NODE_URL);
        //console.log(provider);

        const walletMnemonic = ethers.Wallet.fromMnemonic(WALLET_SECRET_MNEMONIC, WALLET_SECRET_DERIVATION);
        appClient.signer = walletMnemonic.connect(appClient.provider);
        console.log("current wallet address: " + walletMnemonic.address);
        console.log("courtesy address: " + COURTESY_ADDRESS);

        appClient.signer.getBalance().then((bal) => {
            console.log('current wallet balance: ' + ethers.utils.formatEther(bal.toBigInt()))
        });

        // ERC-721 contract address - '0x89323f00a621D4eD6A56a93295C5f10f4df57FFa'
        // implementation address - '0x2437e41acdad73a40adbb71a36d208f84b66a67b'
        appClient.proxyContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, appClient.signer);
        //console.log(proxyContract);

        //setCompoundAllEventListener(appClient.proxyContract);
        //setCompoundRewardEventListener(appClient.proxyContract);

        // remove all listeners
        //proxyContract.removeAllListeners();

        console.log('starting cronjob.');

        // every minute                       ('* * * * *')
        // every 2 minute on the hour         ('*/2 * * * *')
        // every hour on the 0th minute 0     ('0 */1 * * *')
        // every 4 hours on the 0th minute 0  ('0 */4 * * *')

        // WARN: TEST ONLY - try not to test less than 2 mins
	// 
        // every 4 hours on the 0th minute 0  ('0 */4 * * *')
        schedule.scheduleJob('0 */4 * * *', () => {
            console.log('autorun compoundRewards - current time: ' + new Date());
            autoCompoundReward(appClient);
        });
    }
}
