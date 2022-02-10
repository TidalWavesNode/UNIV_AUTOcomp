## AUTO REWARDS COMPOUNDING AVAX UNIV PLANETS
* script will pay small courtesy tips to owner at each run for the convenience
* script does not compoundAll, for large planet amounts, scale staking your gas usage - its EVM...
* rate limit your scheduling responsibly to every 1/2/4/8 hours
* PS: please use this for educational purposes only and at your own risk

## Steps To Run
1. Create free account at [Moralis](https://moralis.io/) for AVAX RPC endpoint (no server needed)
    * You must have this RPC to interact with AVAX C-Chain
    * DO NOT EVER SHARE OR CHECKIN!!! `.env.local` or `.env`
    * Copy mainnet/testnet speedy nodes into your dotenv
    * Copy wallet credentials into your dotenv
   
3. Configure contract/wallet address, abi, gas limit, delays etc under `src/config.js`
    * script owner needs to set target tip address: line4: `CONFIG_COURTESY_ADDRESS: "REPLACE WITH TIP TARGET ADDRESS HERE"`

4. Under `app.js`:
   1. For tipping - adjust line 101-103 as needed (after you finished step2)
   ```javascript
   //TODO: uncomment line below to skip the tipping, comment line to tip
   //  return await tipAwaitBool(true);
   //
   ```
   2. Arbitrary delay is inserted between each planet compounding to cope with
   transaction overrun and be more human-like, adjust the bounds under `src/config.js`

5. `run.js` is the script you run to kickoff cron schedules, with nodeJS (tested node version: v14.18)
```shell
npm install
mv .env.local .env
node run.js
```

## Resources:
* [UNIV OBSERVATORY](https://univ.money/observatory)
* [UNIV CONTRACTS](https://docs.univ.money/technical-details/smart-contracts)

