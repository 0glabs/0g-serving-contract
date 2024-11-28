import * as fs from "fs";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import path from "path";
import { UpgradeableBeacon } from "../../typechain-types";
import { CONTRACTS, transact, validateError } from "../utils/utils";

task("upgrade", "upgrade contract")
    .addParam("name", "name of the proxy contract", undefined, types.string, false)
    .addParam("artifact", "name of the implementation contract", undefined, types.string, false)
    .addParam("execute", "settle transaction on chain", false, types.boolean, true)
    .setAction(async (taskArgs: { name: string; artifact: string; execute: boolean }, hre) => {
        const { deployments, getNamedAccounts } = hre;
        const { deployer } = await getNamedAccounts();
        const beacon: UpgradeableBeacon = await hre.ethers.getContract(`${taskArgs.name}Beacon`, deployer);

        const result = await deployments.deploy(`${taskArgs.name}Impl`, {
            from: deployer,
            contract: taskArgs.artifact,
            log: true,
        });
        console.log(`new implementation deployed: ${result.address}`);

        await transact(beacon, "upgradeTo", [result.address], taskArgs.execute);
    });

task("upgrade:validate", "validate upgrade")
    .addParam("old", "name of the old contract", undefined, types.string, false)
    .addParam("new", "artifact of the new contract", undefined, types.string, false)
    .setAction(async (taskArgs: { old: string; new: string }, hre) => {
        const oldAddr = await (await hre.ethers.getContract(`${taskArgs.old}Impl`)).getAddress();
        const newImpl = await hre.ethers.getContractFactory(taskArgs.new);
        const chainId = (await hre.ethers.provider.getNetwork()).chainId;
        const tmpFileName = `unknown-${chainId}.json`;
        const tmpFilePath = path.resolve(__dirname, `../../.openzeppelin/${tmpFileName}`);
        const fileName = `${hre.network.name}-${chainId}.json`;
        const filePath = path.resolve(__dirname, `../../.openzeppelin/${fileName}`);
        if (fs.existsSync(filePath)) {
            fs.copyFileSync(filePath, tmpFilePath);
        } else {
            throw Error(`network file ${filePath} not found!`);
        }
        await hre.upgrades.validateUpgrade(oldAddr, newImpl, {
            unsafeAllow: ["constructor", "state-variable-immutable"],
            kind: "beacon",
        });
        fs.rmSync(tmpFilePath);
    });

task("upgrade:forceImportAll", "import contracts").setAction(async (_taskArgs, hre) => {
    const proxied = await getProxyInfo(hre);
    console.log(`proxied: ${Array.from(proxied).join(", ")}`);
    const chainId = (await hre.ethers.provider.getNetwork()).chainId;
    console.log(`chainId: ${chainId}`);
    const tmpFileName = `unknown-${chainId}.json`;
    const tmpFilePath = path.resolve(__dirname, `../../.openzeppelin/${tmpFileName}`);
    if (fs.existsSync(tmpFilePath)) {
        console.log(`removing tmp network file ${tmpFilePath}..`);
        fs.rmSync(tmpFilePath);
    }
    for (const name of Array.from(proxied)) {
        const addr = await (await hre.ethers.getContract(`${name}Impl`)).getAddress();
        const factory = await hre.ethers.getContractFactory(name);
        try {
            await hre.upgrades.forceImport(addr, factory, {
                kind: "beacon",
            });
            console.log(`force imported ${name}.`);
        } catch (e) {
            validateError(e, "The following deployment clashes with an existing one at");
            console.log(`${name} already imported.`);
        }
    }
    if (fs.existsSync(tmpFilePath)) {
        const newFileName = `${hre.network.name}-${chainId}.json`;
        const newFilePath = path.resolve(__dirname, `../../.openzeppelin/${newFileName}`);
        console.log(`renaming tmp network file ${tmpFileName} to ${newFileName}..`);
        fs.renameSync(tmpFilePath, newFilePath);
    }
});

export async function getProxyInfo(hre: HardhatRuntimeEnvironment) {
    const proxied = new Set<string>();
    for (const contractMeta of Object.values(CONTRACTS)) {
        const name = contractMeta.name;
        try {
            await hre.ethers.getContract(`${name}Beacon`);
            proxied.add(name);
        } catch (e) {
            validateError(e, "No Contract deployed with name");
        }
    }
    return proxied;
}
