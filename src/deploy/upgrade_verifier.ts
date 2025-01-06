import { Signer } from "ethers";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { CONTRACTS, deployDirectly, getTypedContract } from "../utils/utils";

const servingAddress = "0xE7F0998C83a81f04871BEdfD89aB5f2DAcDBf435";

const upgradeVerifier: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    await deployDirectly(hre, CONTRACTS.Verifier);
    const verifier_ = await getTypedContract(hre, CONTRACTS.Verifier);
    const verifierAddress = await verifier_.getAddress();

    let signer: Signer | string = (await hre.getNamedAccounts()).deployer;
    if (typeof signer === "string") {
        signer = await hre.ethers.getSigner(signer);
    }
    const serving_ = CONTRACTS.InferenceServing.factory.connect(servingAddress, signer);

    if (!(await serving_.initialized())) {
        console.log("serving contract is not initialized");
    }
    await (await serving_.updateBatchVerifierAddress(verifierAddress)).wait();
};

upgradeVerifier.tags = ["Upgrade_Verifier"];
upgradeVerifier.dependencies = [];
export default upgradeVerifier;
