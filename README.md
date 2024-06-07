# 0G Data Retrieve Contract

## Compile

```shell
yarn
yarn compile
```

## Deploy

```shell
yarn deploy zg
```

## Upgrade

```shell
BEACON_ADDRESS=<old beacon address> DATA_RETRIEVE_ADDRESS=<proxy address> yarn upgradeBeacon zg
```

## Test

1. Unit Test

    ```shell
    yarn test
    ```

2. Manually Test

    For example, deposit funds, update the contract, and verify the state of the new contract.

    1. Deploy contract

        ```shell
        yarn deploy zg
        ```

    2. Access the Hardhat console and deposit funds:

        ```shell
        yarn hardhat console --network zg
        # Commands in the Hardhat console:
        const DataRetrieve = await ethers.getContractFactory("DataRetrieve")
        const dataRetrieve = await DataRetrieve.attach("<proxy contract name>")
        await dataRetrieve.depositFund({ value: 1000 })
        await dataRetrieve.lockTime()
        ```

    3. Upgrade the contract

        ```shell
        BEACON_ADDRESS=<old beacon address> DATA_RETRIEVE_ADDRESS=<proxy address> yarn upgradeBeacon zg
        ```

    4. Re-enter the Hardhat console and check the contract states:

        ```shell
        yarn hardhat console --network zg
        # Commands in the Hardhat console:
        const DataRetrieveV2 = await ethers.getContractFactory("DataRetrieveV2")
        const dataRetrieveV2 = await DataRetrieveV2.attach("<proxy contract name>")
        const [userAddresses,userBalances] = (await dataRetrieveV2.retrieveAllData())
        # userBalances should be equal to [1000]
        ```
