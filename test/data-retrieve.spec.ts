import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { Block, BytesLike, ContractTransactionResponse, randomBytes, TransactionReceipt } from "ethers";
import { ethers, upgrades } from "hardhat";
import { beforeEach } from "mocha";
import { DataRetrieve, DataRetrieve__factory } from "../typechain-types";
import { RequestStruct, RequestTraceStruct } from "../typechain-types/contracts/DataRetrieve";

describe("DataRetrieve", () => {
    let DataRetrieve: DataRetrieve__factory, dataRetrieve: DataRetrieve;
    let owner: HardhatEthersSigner,
        user1: HardhatEthersSigner,
        provider1: HardhatEthersSigner,
        provider2: HardhatEthersSigner;
    let ownerAddress: string, user1Address: string, provider1Address: string, provider2Address: string;
    let provider1createdAt: number;

    const ownerInitialBalance = 1000;
    const user1InitialBalance = 2000;
    const lockTime = 24 * 60 * 60;

    const provider1ServiceType = randomBytes(32);
    const provider1InputPrice = 100;
    const provider1OutputPrice = 100;
    const provider1Url = "https://example-1.com";

    const provider2ServiceType = randomBytes(32);
    const provider2InputPrice = 100;
    const provider2OutputPrice = 100;
    const provider2Url = "https://example-2.com";

    beforeEach(async () => {
        [owner, user1, provider1, provider2] = await ethers.getSigners();
        DataRetrieve = await ethers.getContractFactory("DataRetrieve");
    });

    beforeEach(async () => {
        const beacon = await upgrades.deployBeacon(DataRetrieve);
        dataRetrieve = (await upgrades.deployBeaconProxy(beacon, DataRetrieve, [lockTime])) as unknown as DataRetrieve;

        [ownerAddress, user1Address, provider1Address, provider2Address] = await Promise.all([
            owner.getAddress(),
            user1.getAddress(),
            provider1.getAddress(),
            provider2.getAddress(),
        ]);

        const initializations: ContractTransactionResponse[] = await Promise.all([
            dataRetrieve.depositFund(provider1Address, { value: ownerInitialBalance }),
            dataRetrieve.connect(user1).depositFund(provider1Address, { value: user1InitialBalance }),
            dataRetrieve
                .connect(provider1)
                .addOrUpdateService(provider1ServiceType, provider1InputPrice, provider1OutputPrice, provider1Url),
            dataRetrieve
                .connect(provider2)
                .addOrUpdateService(provider2ServiceType, provider2InputPrice, provider2OutputPrice, provider2Url),
        ]);

        const receipt = await initializations[2].wait();
        const block = await ethers.provider.getBlock((receipt as TransactionReceipt).blockNumber);
        provider1createdAt = (block as Block).timestamp;
    });

    describe("Owner", () => {
        it("should succeed in updating lock time succeed", async () => {
            const updatedLockTime = 2 * 24 * 60 * 60;
            await expect(dataRetrieve.updateLockTime(updatedLockTime)).not.to.be.reverted;

            const result = await dataRetrieve.lockTime();
            expect(result).to.equal(BigInt(updatedLockTime));
        });
    });

    describe("User", () => {
        it("should fail to update the lock time if it is not the owner", async () => {
            const updatedLockTime = 2 * 24 * 60 * 60;
            await expect(dataRetrieve.connect(user1).updateLockTime(updatedLockTime)).to.be.revertedWithCustomError(
                DataRetrieve,
                "OwnableUnauthorizedAccount"
            );

            const result = await dataRetrieve.lockTime();
            expect(result).to.equal(BigInt(lockTime));
        });

        it("should deposit fund and update balance", async () => {
            const depositAmount = 1000;
            await dataRetrieve.depositFund(provider1Address, { value: depositAmount });

            const updatedBalance = await dataRetrieve.getUserAccountBalance(ownerAddress, provider1);
            expect(updatedBalance).to.equal(BigInt(ownerInitialBalance + depositAmount));
        });

        it("should get all users", async () => {
            const [userAddresses, providerAddresses, balances] = (await dataRetrieve.getAllUserAccounts()).map(
                (value) => [...value]
            );

            expect(userAddresses).to.have.members([ownerAddress, user1Address]);
            expect(providerAddresses).to.have.members([provider1Address, provider1Address]);
            expect(balances).to.have.members([BigInt(ownerInitialBalance), BigInt(user1InitialBalance)]);
        });
    });

    describe("Process refund", () => {
        let unlockTime: number, refundIndex: bigint;
        const refundAmount = 500;

        beforeEach(async () => {
            const res = await dataRetrieve.requestRefund(provider1, refundAmount);
            const receipt = await res.wait();
            const block = await ethers.provider.getBlock((receipt as TransactionReceipt).blockNumber);
            unlockTime = (block as Block).timestamp + lockTime;
            refundIndex = (await dataRetrieve.queryFilter(dataRetrieve.filters.RefundRequested, -1))[0].args[2];
        });

        it("should revert if called too soon", async () => {
            await expect(dataRetrieve.processRefund(provider1, refundIndex)).to.be.reverted;
        });

        it("should succeeded if the unlockTime has arrived and called", async () => {
            await time.increaseTo(unlockTime);

            await expect(dataRetrieve.processRefund(provider1, refundIndex)).not.to.be.reverted;
            const finalBalance = await dataRetrieve.getUserAccountBalance(ownerAddress, provider1);
            expect(finalBalance).to.be.equal(BigInt(ownerInitialBalance - refundAmount));
        });
    });

    describe("Service provider", () => {
        it("should get service", async () => {
            const [retrievedInputPrice, retrievedOutputPrice, retrievedUrl, updatedAt] = await dataRetrieve.getService(
                provider1Address,
                provider1ServiceType
            );

            expect(retrievedInputPrice).to.equal(provider1InputPrice);
            expect(retrievedOutputPrice).to.equal(provider1OutputPrice);
            expect(retrievedUrl).to.equal(provider1Url);
            expect(updatedAt).to.not.equal(0);
        });

        it("should get all services", async () => {
            const [addresses, inputPrices, outputPrices, urls, serviceTypes, updatedAts] = (
                await dataRetrieve.getAllServices()
            ).map((value) => [...value]);

            expect(addresses).to.have.members([provider1Address, provider2Address]);
            expect(inputPrices).to.have.members([BigInt(provider1InputPrice), BigInt(provider2InputPrice)]);
            expect(outputPrices).to.have.members([BigInt(provider1OutputPrice), BigInt(provider2OutputPrice)]);
            expect(urls).to.have.members([provider1Url, provider2Url]);
            expect(serviceTypes).to.have.members([
                "0x" + Buffer.from(provider1ServiceType).toString("hex"),
                "0x" + Buffer.from(provider2ServiceType).toString("hex"),
            ]);
            expect(updatedAts[0]).to.not.equal(0);
            expect(updatedAts[1]).to.not.equal(0);
        });

        it("should update service", async () => {
            const modifiedInputPrice = 200;
            const modifiedPriceUrl = "https://example-modified.com";

            await expect(
                dataRetrieve
                    .connect(provider1)
                    .addOrUpdateService(provider1ServiceType, modifiedInputPrice, provider2InputPrice, modifiedPriceUrl)
            )
                .to.emit(dataRetrieve, "ServiceUpdated")
                .withArgs(
                    provider1Address,
                    "0x" + Buffer.from(provider1ServiceType).toString("hex"),
                    modifiedInputPrice,
                    provider2InputPrice,
                    modifiedPriceUrl,
                    anyValue
                );

            const [retrievedInputPrice, , retrievedUrl, updatedAt] = await dataRetrieve.getService(
                provider1Address,
                provider1ServiceType
            );

            expect(retrievedInputPrice).to.equal(modifiedInputPrice);
            expect(retrievedUrl).to.equal(modifiedPriceUrl);
            expect(updatedAt).to.not.equal(0);
        });

        it("should remove service correctly", async function () {
            await expect(dataRetrieve.connect(provider1).removeService(provider1ServiceType))
                .to.emit(dataRetrieve, "ServiceRemoved")
                .withArgs(provider1Address, "0x" + Buffer.from(provider1ServiceType).toString("hex"));

            const [addresses] = await dataRetrieve.getAllServices();
            expect(addresses.length).to.equal(1);
        });
    });

    describe("Settle fees", () => {
        let requestTrace: RequestTraceStruct[];
        let requestCreatedAt: number;
        const requestLength = 3;
        const inputCount = 1;
        const outputCount = 1;
        const fee =
            requestLength * inputCount * provider1InputPrice + requestLength * outputCount * provider1OutputPrice;

        beforeEach(async () => {
            requestCreatedAt = provider1createdAt + 1;
            let previousSignature1: BytesLike = "0x0000000000000000000000000000000000000000";
            let previousSignature2: BytesLike = "0x0000000000000000000000000000000000000000";
            const requestsFromOwner = [];
            for (let index = 0; index < requestLength; index++) {
                const request = await getSignedRequest(
                    owner,
                    ownerAddress,
                    provider1Address,
                    provider1ServiceType,
                    inputCount,
                    outputCount,
                    requestCreatedAt,
                    previousSignature1,
                    index + 1
                );
                previousSignature1 = request.signature;
                requestsFromOwner.push(request);
            }

            const requestsFromUser1 = [];
            for (let index = 0; index < requestLength; index++) {
                const request = await getSignedRequest(
                    user1,
                    user1Address,
                    provider1Address,
                    provider1ServiceType,
                    inputCount,
                    outputCount,
                    requestCreatedAt,
                    previousSignature2,
                    index + 1
                );
                previousSignature2 = request.signature;
                requestsFromUser1.push(request);
            }

            requestTrace = [{ requests: requestsFromOwner }, { requests: requestsFromUser1 }];
        });

        it("should succeed", async () => {
            await expect(dataRetrieve.connect(provider1).settleFees(requestTrace))
                .to.emit(dataRetrieve, "BalanceUpdated")
                .withArgs(ownerAddress, provider1, ownerInitialBalance - fee)
                .and.to.emit(dataRetrieve, "BalanceUpdated")
                .withArgs(user1Address, provider1, user1InitialBalance - fee);
        });

        it("should failed due to double spending", async () => {
            requestTrace[0].requests[1].nonce = requestTrace[0].requests[0].nonce;

            await expect(dataRetrieve.connect(provider1).settleFees(requestTrace)).to.be.revertedWith("Nonce used");
        });

        it("should failed due to invalid nonce", async () => {
            requestTrace[0].requests[0].nonce = 99999;

            await expect(dataRetrieve.connect(provider1).settleFees(requestTrace)).to.be.revertedWith(
                "Invalid request"
            );
        });

        it("should failed due to changes in the service after the request was made", async () => {
            await time.increaseTo(requestCreatedAt + 1);
            const modifiedInputPrice = 10000;
            const tx = await dataRetrieve
                .connect(provider1)
                .addOrUpdateService(provider1ServiceType, modifiedInputPrice, provider1OutputPrice, provider1Url);
            await tx.wait();

            await expect(dataRetrieve.connect(provider1).settleFees(requestTrace)).to.be.revertedWith(
                "Service updated"
            );
        });

        it("should failed due to insufficient balance", async () => {
            const excessiveRequestLength = user1InitialBalance / (provider1InputPrice + provider1OutputPrice) + 1;
            let previousSignature: BytesLike = "0x0000000000000000000000000000000000000000";
            const excessiveRequests = [];
            for (let index = 0; index < excessiveRequestLength; index++) {
                const request = await getSignedRequest(
                    user1,
                    user1Address,
                    provider1Address,
                    provider1ServiceType,
                    inputCount,
                    outputCount,
                    requestCreatedAt,
                    previousSignature,
                    index + 1
                );
                previousSignature = request.signature;
                excessiveRequests.push(request);
            }
            const excessiveRequestTrace = [{ requests: excessiveRequests }];

            await expect(dataRetrieve.connect(provider1).settleFees(excessiveRequestTrace)).to.be.revertedWith(
                "Insufficient balance"
            );
        });
    });
});

async function getSignedRequest(
    signer: HardhatEthersSigner,
    userAddress: string,
    provider: string,
    serviceType: Uint8Array,
    inputCount: number,
    previousOutputCount: number,
    createdAt: number,
    previousSignature: BytesLike,
    nonce: number
): Promise<RequestStruct> {
    const hash = ethers.solidityPackedKeccak256(
        ["address", "address", "bytes32", "uint", "uint", "bytes", "uint", "uint"],
        [provider, userAddress, serviceType, inputCount, previousOutputCount, previousSignature, nonce, createdAt]
    );

    const signature = await signer.signMessage(ethers.toBeArray(hash));

    return {
        userAddress,
        serviceType,
        inputCount,
        previousOutputCount,
        createdAt,
        previousSignature,
        nonce,
        signature,
    };
}
