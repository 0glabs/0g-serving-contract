import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { CONTRACTS, getTypedContract } from "../utils/utils";

const lockTime = parseInt(process.env["LOCK_TIME"] || "86400");
const penaltyPercentage = parseInt(process.env["PENALTY_PERCENTAGE"] || "30");

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployer } = await hre.getNamedAccounts();

    const inferenceServing = await getTypedContract(hre, CONTRACTS.InferenceServing);

    const fineTuningServing = await getTypedContract(hre, CONTRACTS.FineTuningServing);
    const ledgerManager = await getTypedContract(hre, CONTRACTS.LedgerManager);

    const fineTuningServingAddress = await fineTuningServing.getAddress();
    const inferenceServingAddress = await inferenceServing.getAddress();
    const ledgerManagerAddress = await ledgerManager.getAddress();

    console.log(`initializing inference serving..`);
    if (!(await inferenceServing.initialized())) {
        // Initialize without verifier address as ZK verification is no longer used
        await (await inferenceServing.initialize(lockTime, "0x0000000000000000000000000000000000000000", ledgerManagerAddress, deployer)).wait();
    }

    console.log(`initializing fine-tuning serving..`);
    if (!(await fineTuningServing.initialized())) {
        await (await fineTuningServing.initialize(lockTime, ledgerManagerAddress, deployer, penaltyPercentage)).wait();
    }

    console.log(`initializing ledger manager..`);
    if (!(await ledgerManager.initialized())) {
        await (await ledgerManager.initialize(inferenceServingAddress, fineTuningServingAddress, deployer)).wait();
    }
};

deploy.tags = ["compute-network"];
deploy.dependencies = [CONTRACTS.LedgerManager.name];
export default deploy;
