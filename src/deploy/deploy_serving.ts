import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { CONTRACTS, deployInBeaconProxy, getTypedContract } from "../utils/utils";

const lockTime = parseInt(process.env["LOCK_TIME"] || "86400");

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    await deployInBeaconProxy(hre, CONTRACTS.Serving);

    const serving_ = await getTypedContract(hre, CONTRACTS.Serving);
    await getTypedContract(hre, CONTRACTS.Serving);

    if (!(await serving_.initialized())) {
        await (await serving_.initialize(lockTime)).wait();
    }
};

deploy.tags = [CONTRACTS.Serving.name];
deploy.dependencies = [];
export default deploy;
