import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract } from "ethers";
import { ethers, upgrades } from "hardhat";
import { beforeEach } from "mocha";
import { Serving, ServingV2, ServingV2__factory, Serving__factory } from "../typechain-types";

describe("Upgrade Serving", () => {
    let beacon: Contract;
    let Serving: Serving__factory, ServingV2: ServingV2__factory, serving: Serving, servingV2: ServingV2;
    let owner: HardhatEthersSigner,
        user1: HardhatEthersSigner,
        provider1: HardhatEthersSigner,
        provider2: HardhatEthersSigner;
    let ownerAddress: string, user1Address: string, provider1Address: string, provider2Address: string;

    const ownerInitialBalance = 1000;
    const user1InitialBalance = 2000;
    const lockTime = 24 * 60 * 60;

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
        [owner, user1, provider1, provider2] = await ethers.getSigners();
        Serving = await ethers.getContractFactory("Serving");

        beacon = await upgrades.deployBeacon(Serving);
        serving = (await upgrades.deployBeaconProxy(beacon, Serving, [lockTime])) as unknown as Serving;

        [ownerAddress, user1Address, provider1Address, provider2Address] = await Promise.all([
            owner.getAddress(),
            user1.getAddress(),
            provider1.getAddress(),
            provider2.getAddress(),
        ]);

        await Promise.all([
            serving.depositFund(provider1, { value: ownerInitialBalance }),
            serving.connect(user1).depositFund(provider1, { value: user1InitialBalance }),
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
        ServingV2 = (await ethers.getContractFactory("ServingV2")) as unknown as ServingV2__factory;
        await upgrades.upgradeBeacon(beacon, ServingV2);
        servingV2 = ServingV2.attach(await serving.getAddress()) as unknown as ServingV2;

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
        ] = (await servingV2.getAllData()).map((value) => [...value]);

        expect(userAddresses).to.have.members([ownerAddress, user1Address]);
        expect(userAccountProviderAddresses).to.have.members([provider1Address, provider1Address]);
        expect(userAccountBalances).to.have.members([BigInt(ownerInitialBalance), BigInt(user1InitialBalance)]);
        expect(providerAddresses).to.have.members([provider1Address, provider2Address]);
        expect(serviceNames).to.have.members([provider1Name, provider2Name]);
        expect(serviceTypes).to.have.members([provider1Type, provider2Type]);
        expect(serviceUrls).to.have.members([provider1Url, provider2Url]);
        expect(serviceInputPrices).to.have.members([BigInt(provider1InputPrice), BigInt(provider2InputPrice)]);
        expect(serviceOutputPrices).to.have.members([BigInt(provider1OutputPrice), BigInt(provider2OutputPrice)]);
        expect(serviceUpdatedAts[0]).to.not.equal(0);
        expect(serviceUpdatedAts[1]).to.not.equal(0);
    });
});
