import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { CONTRACTS, deployInBeaconProxy } from "../utils/utils";

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    await deployInBeaconProxy(hre, CONTRACTS.InferenceServing);
};

deploy.tags = [CONTRACTS.InferenceServing.name];
deploy.dependencies = [CONTRACTS.Verifier.name];
export default deploy;
