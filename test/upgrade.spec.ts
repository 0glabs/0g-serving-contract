import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { deployments, ethers, getNamedAccounts } from "hardhat";
import { Deployment } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { beforeEach } from "mocha";
import { upgradeImplementation } from "../src/utils/utils";
import { Serving, ServingV2 } from "../typechain-types";

describe("Upgrade Serving", () => {
    let serving: Serving, servingV2: ServingV2;
    let servingDeployment: Deployment, beaconDeployment: Deployment;
    let owner: HardhatEthersSigner,
        user1: HardhatEthersSigner,
        provider1: HardhatEthersSigner,
        provider2: HardhatEthersSigner;
    let ownerAddress: string, user1Address: string, provider1Address: string, provider2Address: string;

    const ownerInitialBalance = 1000;
    const user1InitialBalance = 2000;

    const provider1Name = "test-provider-1";
    const provider1Type = "HTTP";
    const provider1InputPrice = 100;
    const provider1OutputPrice = 100;
    const provider1Url = "https://example-1.com";

    const provider2Name = "test-provider-2";
    const provider2Type = "HTTP";
    const provider2InputPrice = 100;
    const provider2OutputPrice = 100;
    const provider2Url = "https://example-2.com";

    beforeEach(async () => {
        await deployments.fixture(["Serving"]);

        [owner, user1, provider1, provider2] = await ethers.getSigners();
        [ownerAddress, user1Address, provider1Address, provider2Address] = await Promise.all([
            owner.getAddress(),
            user1.getAddress(),
            provider1.getAddress(),
            provider2.getAddress(),
        ]);

        beaconDeployment = await deployments.get("UpgradeableBeacon");
        servingDeployment = await deployments.get("Serving");
        serving = await ethers.getContractAt("Serving", servingDeployment.address);

        await Promise.all([
            serving.depositFund(provider1Address, { value: ownerInitialBalance }),
            serving
                .connect(user1)
                .depositFund(provider1Address, { value: user1InitialBalance, from: await user1.getAddress() }),
            serving
                .connect(provider1)
                .addOrUpdateService(
                    provider1Name,
                    provider1Type,
                    provider1Url,
                    provider1InputPrice,
                    provider1OutputPrice
                ),
            serving
                .connect(provider2)
                .addOrUpdateService(
                    provider2Name,
                    provider2Type,
                    provider2Url,
                    provider2InputPrice,
                    provider2OutputPrice
                ),
        ]);
    });

    it("should succeed in getting status set by old contract", async () => {
        await upgradeImplementation(
            { deployments, getNamedAccounts, ethers } as HardhatRuntimeEnvironment,
            "ServingV2",
            beaconDeployment.address
        );
        servingV2 = (await ethers.getContractAt("ServingV2", servingDeployment.address)) as ServingV2;

        const [
            userAddresses,
            userAccountProviderAddresses,
            userAccountBalances,
            providerAddresses,
            serviceNames,
            serviceTypes,
            serviceUrls,
            serviceInputPrices,
            serviceOutputPrices,
            serviceUpdatedAts,
        ] = (await servingV2.getAllData()).map((value) => value.map((b) => b.toString()));

        expect(userAddresses).to.have.members([ownerAddress, user1Address]);
        expect(userAccountProviderAddresses).to.have.members([provider1Address, provider1Address]);
        expect(userAccountBalances).to.have.members([ownerInitialBalance.toString(), user1InitialBalance.toString()]);
        expect(providerAddresses).to.have.members([provider1Address, provider2Address]);
        expect(serviceNames).to.have.members([provider1Name, provider2Name]);
        expect(serviceTypes).to.have.members([provider1Type, provider2Type]);
        expect(serviceUrls).to.have.members([provider1Url, provider2Url]);
        expect(serviceInputPrices).to.have.members([provider1InputPrice.toString(), provider2InputPrice.toString()]);
        expect(serviceOutputPrices).to.have.members([provider1OutputPrice.toString(), provider2OutputPrice.toString()]);
        expect(serviceUpdatedAts[0]).to.not.equal(0);
        expect(serviceUpdatedAts[1]).to.not.equal(0);
    });
});
