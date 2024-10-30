# 0G Serving Contract

## Prerequisites

- Node.js: 20.16.0
- Yarn: 1.22.22

## Compilation

```shell
yarn
yarn compile
```

## Deployment

```shell
yarn deploy zg
```

After deployment, make sure to update the following files with the appropriate addresses:

- In `upgrade_serving.ts`, update the `beaconDeploymentAddress`.
- In `upgrade_verifier.ts`, update the `servingAddress`.

## Upgrading Contracts

### General Contract Upgrade

```shell
yarn upgradeContract zg
```

### Upgrade BatchVerifier.sol

```shell
yarn upgradeVerifier zg
```

## Testing

```shell
yarn test
```
