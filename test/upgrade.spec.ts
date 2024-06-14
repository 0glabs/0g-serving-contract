import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract, randomBytes } from "ethers";
import { ethers, upgrades } from "hardhat";
import { beforeEach } from "mocha";
import { DataRetrieve, DataRetrieveV2, DataRetrieveV2__factory, DataRetrieve__factory } from "../typechain-types";

describe("Upgrade DataRetrieve", () => {
    let beacon: Contract;
    let DataRetrieve: DataRetrieve__factory,
        DataRetrieveV2: DataRetrieveV2__factory,
        dataRetrieve: DataRetrieve,
        dataRetrieveV2: DataRetrieveV2;
    let owner: HardhatEthersSigner,
        user1: HardhatEthersSigner,
        provider1: HardhatEthersSigner,
        provider2: HardhatEthersSigner;
    let ownerAddress: string, user1Address: string, provider1Address: string, provider2Address: string;

    const ownerInitialBalance = 1000;
    const user1InitialBalance = 2000;
    const lockTime = 24 * 60 * 60;

    const provider1ServiceType = randomBytes(32);
    const provider1Price = 100;
    const provider1Url = "https://example-1.com";

    const provider2ServiceType = randomBytes(32);
    const provider2Price = 100;
    const provider2Url = "https://example-2.com";

    beforeEach(async () => {
        [owner, user1, provider1, provider2] = await ethers.getSigners();
        DataRetrieve = await ethers.getContractFactory("DataRetrieve");

        beacon = await upgrades.deployBeacon(DataRetrieve);
        dataRetrieve = (await upgrades.deployBeaconProxy(beacon, DataRetrieve, [lockTime])) as unknown as DataRetrieve;

        [ownerAddress, user1Address, provider1Address, provider2Address] = await Promise.all([
            owner.getAddress(),
            user1.getAddress(),
            provider1.getAddress(),
            provider2.getAddress(),
        ]);

        await Promise.all([
            dataRetrieve.depositFund(provider1, { value: ownerInitialBalance }),
            dataRetrieve.connect(user1).depositFund(provider1, { value: user1InitialBalance }),
            dataRetrieve.connect(provider1).addOrUpdateService(provider1ServiceType, provider1Price, provider1Url),
            dataRetrieve.connect(provider2).addOrUpdateService(provider2ServiceType, provider2Price, provider2Url),
        ]);
    });

    it("should succeed in getting status set by old contract", async () => {
        DataRetrieveV2 = (await ethers.getContractFactory("DataRetrieveV2")) as unknown as DataRetrieveV2__factory;
        await upgrades.upgradeBeacon(beacon, DataRetrieveV2);
        dataRetrieveV2 = DataRetrieveV2.attach(await dataRetrieve.getAddress()) as unknown as DataRetrieveV2;

        const [
            userAddresses,
            userAccountProviderAddresses,
            userAccountBalances,
            providerAddresses,
            servicePrices,
            serviceUrls,
            serviceTypes,
            serviceUpdatedAts,
        ] = (await dataRetrieveV2.retrieveAllData()).map((value) => [...value]);

        expect(userAddresses).to.have.members([ownerAddress, user1Address]);
        expect(userAccountProviderAddresses).to.have.members([provider1Address, provider1Address]);
        expect(userAccountBalances).to.have.members([BigInt(ownerInitialBalance), BigInt(user1InitialBalance)]);
        expect(providerAddresses).to.have.members([provider1Address, provider2Address]);
        expect(servicePrices).to.have.members([BigInt(provider1Price), BigInt(provider2Price)]);
        expect(serviceUrls).to.have.members([provider1Url, provider2Url]);
        expect(serviceTypes).to.have.members([
            "0x" + Buffer.from(provider1ServiceType).toString("hex"),
            "0x" + Buffer.from(provider2ServiceType).toString("hex"),
        ]);
        expect(serviceUpdatedAts[0]).to.not.equal(0);
        expect(serviceUpdatedAts[1]).to.not.equal(0);
    });
});
