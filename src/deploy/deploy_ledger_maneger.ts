import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { CONTRACTS, deployInBeaconProxy } from "../utils/utils";

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    await deployInBeaconProxy(hre, CONTRACTS.LedgerManager);
};

deploy.tags = [CONTRACTS.LedgerManager.name, "compute-network"];
deploy.dependencies = [CONTRACTS.FineTuningServing.name, CONTRACTS.InferenceServing.name];
export default deploy;
