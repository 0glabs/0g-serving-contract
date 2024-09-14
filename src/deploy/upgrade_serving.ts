import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { upgradeImplementation } from "../utils/utils";

const beaconDeploymentAddress = "0x1d948fDFB53e5565cD530817FACCfed9498b4615";

const upgrade: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    if (!beaconDeploymentAddress) {
        console.error("Beacon deployment address is required");
        process.exit(1);
    }
    await upgradeImplementation(hre, "Serving", beaconDeploymentAddress);
};

upgrade.tags = ["Upgrade"];
upgrade.dependencies = [];
export default upgrade;
