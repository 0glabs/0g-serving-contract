# Deploy and Upgrade

## Prerequisites

- Node.js: 20.16.0
- Yarn: 1.22.22

## Compilation

```shell
yarn
yarn compile
```

## Deploy and Upgrade Serving.sol

Follow [Standard Operating Procedure for Contract Deployment/Upgrade](https://github.com/0glabs/0g-storage-contracts?tab=readme-ov-file#standard-operating-procedure-for-contract-deploymentupgrade)

After deployment, make sure to update the following files with the appropriate addresses:

- In `upgrade_verifier.ts`, update the `servingAddress`.

### Upgrade BatchVerifier.sol

```shell
yarn upgradeVerifier zg
```

### Testing

```shell
yarn test
```
