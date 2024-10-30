import { Signer } from "ethers";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { CONTRACTS, deployDirectly, getTypedContract } from "../utils/utils";

const servingAddress = "0x9Ae9b2C822beFF4B4466075006bc6b5ac35E779F";

const upgradeVerifier: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    await deployDirectly(hre, CONTRACTS.Verifier);
    const verifier_ = await getTypedContract(hre, CONTRACTS.Verifier);
    const verifierAddress = await verifier_.getAddress();

    let signer: Signer | string = (await hre.getNamedAccounts()).deployer;
    if (typeof signer === "string") {
        signer = await hre.ethers.getSigner(signer);
    }
    const serving_ = CONTRACTS.Serving.factory.connect(servingAddress, signer);

    if (!(await serving_.initialized())) {
        console.log("serving contract is not initialized");
    }
    await (await serving_.updateBatchVerifierAddress(verifierAddress)).wait();
};

upgradeVerifier.tags = ["Upgrade_Verifier"];
upgradeVerifier.dependencies = [];
export default upgradeVerifier;
