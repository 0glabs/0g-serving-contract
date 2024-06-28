import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { Block, ContractTransactionResponse, TransactionReceipt } from "ethers";
import { ethers, upgrades } from "hardhat";
import { beforeEach } from "mocha";
import { Serving, Serving__factory } from "../typechain-types";
import { RequestStruct, RequestTraceStruct } from "../typechain-types/contracts/Serving";

describe("Serving", () => {
    let Serving: Serving__factory, serving: Serving;
    let owner: HardhatEthersSigner,
        user1: HardhatEthersSigner,
        provider1: HardhatEthersSigner,
        provider2: HardhatEthersSigner;
    let ownerAddress: string, user1Address: string, provider1Address: string, provider2Address: string;
    let provider1createdAt: number;

    const ownerInitialBalance = 1000;
    const user1InitialBalance = 2000;
    const lockTime = 24 * 60 * 60;

    const provider1ServiceName = "test-provider-1";
    const provider1ServiceType = "HTTP";
    const provider1InputPrice = 100;
    const provider1OutputPrice = 100;
    const provider1Url = "https://example-1.com";

    const provider2ServiceName = "test-provider-2";
    const provider2ServiceType = "HTTP";
    const provider2InputPrice = 100;
    const provider2OutputPrice = 100;
    const provider2Url = "https://example-2.com";

    beforeEach(async () => {
        [owner, user1, provider1, provider2] = await ethers.getSigners();
        Serving = await ethers.getContractFactory("Serving");
    });

    beforeEach(async () => {
        const beacon = await upgrades.deployBeacon(Serving);
        serving = (await upgrades.deployBeaconProxy(beacon, Serving, [lockTime])) as unknown as Serving;

        [ownerAddress, user1Address, provider1Address, provider2Address] = await Promise.all([
            owner.getAddress(),
            user1.getAddress(),
            provider1.getAddress(),
            provider2.getAddress(),
        ]);

        const initializations: ContractTransactionResponse[] = await Promise.all([
            serving.depositFund(provider1Address, { value: ownerInitialBalance }),
            serving.connect(user1).depositFund(provider1Address, { value: user1InitialBalance }),
            serving
                .connect(provider1)
                .addOrUpdateService(
                    provider1ServiceName,
                    provider1ServiceType,
                    provider1Url,
                    provider1InputPrice,
                    provider1OutputPrice
                ),
            serving
                .connect(provider2)
                .addOrUpdateService(
                    provider2ServiceName,
                    provider2ServiceType,
                    provider2Url,
                    provider2InputPrice,
                    provider2OutputPrice
                ),
        ]);

        const receipt = await initializations[2].wait();
        const block = await ethers.provider.getBlock((receipt as TransactionReceipt).blockNumber);
        provider1createdAt = (block as Block).timestamp;
    });

    describe("Owner", () => {
        it("should succeed in updating lock time succeed", async () => {
            const updatedLockTime = 2 * 24 * 60 * 60;
            await expect(serving.updateLockTime(updatedLockTime)).not.to.be.reverted;

            const result = await serving.lockTime();
            expect(result).to.equal(BigInt(updatedLockTime));
        });
    });

    describe("User", () => {
        it("should fail to update the lock time if it is not the owner", async () => {
            const updatedLockTime = 2 * 24 * 60 * 60;
            await expect(serving.connect(user1).updateLockTime(updatedLockTime)).to.be.revertedWithCustomError(
                Serving,
                "OwnableUnauthorizedAccount"
            );

            const result = await serving.lockTime();
            expect(result).to.equal(BigInt(lockTime));
        });

        it("should deposit fund and update balance", async () => {
            const depositAmount = 1000;
            await serving.depositFund(provider1Address, { value: depositAmount });

            const updatedBalance = await serving.getUserAccountBalance(ownerAddress, provider1);
            expect(updatedBalance).to.equal(BigInt(ownerInitialBalance + depositAmount));
        });

        it("should get all users", async () => {
            const [userAddresses, providerAddresses, balances] = (await serving.getAllUserAccounts()).map((value) => [
                ...value,
            ]);

            expect(userAddresses).to.have.members([ownerAddress, user1Address]);
            expect(providerAddresses).to.have.members([provider1Address, provider1Address]);
            expect(balances).to.have.members([BigInt(ownerInitialBalance), BigInt(user1InitialBalance)]);
        });
    });

    describe("Process refund", () => {
        let unlockTime: number, refundIndex: bigint;
        const refundAmount = 500;

        beforeEach(async () => {
            const res = await serving.requestRefund(provider1, refundAmount);
            const receipt = await res.wait();
            const block = await ethers.provider.getBlock((receipt as TransactionReceipt).blockNumber);
            unlockTime = (block as Block).timestamp + lockTime;
            refundIndex = (await serving.queryFilter(serving.filters.RefundRequested, -1))[0].args[2];
        });

        it("should revert if called too soon", async () => {
            await expect(serving.processRefund(provider1, refundIndex)).to.be.reverted;
        });

        it("should succeeded if the unlockTime has arrived and called", async () => {
            await time.increaseTo(unlockTime);

            await expect(serving.processRefund(provider1, refundIndex)).not.to.be.reverted;
            const finalBalance = await serving.getUserAccountBalance(ownerAddress, provider1);
            expect(finalBalance).to.be.equal(BigInt(ownerInitialBalance - refundAmount));
        });
    });

    describe("Service provider", () => {
        it("should get service", async () => {
            const [serviceType, url, inputPrice, outputPrice, updatedAt] = await serving.getService(
                provider1Address,
                provider1ServiceName
            );

            expect(serviceType).to.equal(provider1ServiceType);
            expect(url).to.equal(provider1Url);
            expect(inputPrice).to.equal(provider1InputPrice);
            expect(outputPrice).to.equal(provider1OutputPrice);
            expect(updatedAt).to.not.equal(0);
        });

        it("should get all services", async () => {
            const [addresses, names, serviceTypes, urls, inputPrices, outputPrices, updatedAts] = (
                await serving.getAllServices()
            ).map((value) => [...value]);

            expect(addresses).to.have.members([provider1Address, provider2Address]);
            expect(names).to.have.members([provider1ServiceName, provider2ServiceName]);
            expect(serviceTypes).to.have.members([provider1ServiceType, provider2ServiceType]);
            expect(urls).to.have.members([provider1Url, provider2Url]);
            expect(inputPrices).to.have.members([BigInt(provider1InputPrice), BigInt(provider2InputPrice)]);
            expect(outputPrices).to.have.members([BigInt(provider1OutputPrice), BigInt(provider2OutputPrice)]);
            expect(updatedAts[0]).to.not.equal(0);
            expect(updatedAts[1]).to.not.equal(0);
        });

        it("should update service", async () => {
            const modifiedServiceType = "RPC";
            const modifiedPriceUrl = "https://example-modified.com";
            const modifiedInputPrice = 200;
            const modifiedOutputPrice = 300;

            await expect(
                serving
                    .connect(provider1)
                    .addOrUpdateService(
                        provider1ServiceName,
                        modifiedServiceType,
                        modifiedPriceUrl,
                        modifiedInputPrice,
                        modifiedOutputPrice
                    )
            )
                .to.emit(serving, "ServiceUpdated")
                .withArgs(
                    provider1Address,
                    "0x" + Buffer.from(provider1ServiceName).toString("hex"),
                    modifiedServiceType,
                    modifiedPriceUrl,
                    modifiedInputPrice,
                    modifiedOutputPrice,
                    anyValue
                );

            const [serviceType, url, inputPrice, outputPrice, updatedAt] = await serving.getService(
                provider1Address,
                provider1ServiceName
            );

            expect(serviceType).to.equal(modifiedServiceType);
            expect(url).to.equal(modifiedPriceUrl);
            expect(inputPrice).to.equal(modifiedInputPrice);
            expect(outputPrice).to.equal(modifiedOutputPrice);
            expect(updatedAt).to.not.equal(0);
        });

        it("should remove service correctly", async function () {
            await expect(serving.connect(provider1).removeService(provider1ServiceName))
                .to.emit(serving, "ServiceRemoved")
                .withArgs(provider1Address, "0x" + Buffer.from(provider1ServiceName).toString("hex"));

            const [addresses] = await serving.getAllServices();
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
            const requestsFromOwner = [];
            for (let index = 0; index < requestLength; index++) {
                const request = await getSignedRequest(
                    owner,
                    ownerAddress,
                    provider1Address,
                    provider1ServiceName,
                    inputCount,
                    outputCount,
                    requestCreatedAt,
                    index + 1
                );
                requestsFromOwner.push(request);
            }

            const requestsFromUser1 = [];
            for (let index = 0; index < requestLength; index++) {
                const request = await getSignedRequest(
                    user1,
                    user1Address,
                    provider1Address,
                    provider1ServiceName,
                    inputCount,
                    outputCount,
                    requestCreatedAt,
                    index + 1
                );
                requestsFromUser1.push(request);
            }

            requestTrace = [{ requests: requestsFromOwner }, { requests: requestsFromUser1 }];
        });

        it("should succeed", async () => {
            await expect(serving.connect(provider1).settleFees(requestTrace))
                .to.emit(serving, "BalanceUpdated")
                .withArgs(ownerAddress, provider1, ownerInitialBalance - fee)
                .and.to.emit(serving, "BalanceUpdated")
                .withArgs(user1Address, provider1, user1InitialBalance - fee);
        });

        it("should failed due to double spending", async () => {
            requestTrace[0].requests[1].nonce = requestTrace[0].requests[0].nonce;

            await expect(serving.connect(provider1).settleFees(requestTrace)).to.be.revertedWith("Nonce used");
        });

        it("should failed due to invalid nonce", async () => {
            requestTrace[0].requests[0].nonce = 99999;

            await expect(serving.connect(provider1).settleFees(requestTrace)).to.be.revertedWith("Invalid request");
        });

        it("should failed due to changes in the service after the request was made", async () => {
            await time.increaseTo(requestCreatedAt + 1);
            const modifiedInputPrice = 10000;
            const tx = await serving
                .connect(provider1)
                .addOrUpdateService(
                    provider1ServiceName,
                    provider1ServiceType,
                    provider1Url,
                    modifiedInputPrice,
                    provider1OutputPrice
                );
            await tx.wait();

            await expect(serving.connect(provider1).settleFees(requestTrace)).to.be.revertedWith("Service updated");
        });

        it("should failed due to insufficient balance", async () => {
            const excessiveRequestLength = user1InitialBalance / (provider1InputPrice + provider1OutputPrice) + 1;
            const excessiveRequests = [];
            for (let index = 0; index < excessiveRequestLength; index++) {
                const request = await getSignedRequest(
                    user1,
                    user1Address,
                    provider1Address,
                    provider1ServiceName,
                    inputCount,
                    outputCount,
                    requestCreatedAt,
                    index + 1
                );
                excessiveRequests.push(request);
            }
            const excessiveRequestTrace = [{ requests: excessiveRequests }];

            await expect(serving.connect(provider1).settleFees(excessiveRequestTrace)).to.be.revertedWith(
                "Insufficient balance"
            );
        });
    });
});

async function getSignedRequest(
    signer: HardhatEthersSigner,
    userAddress: string,
    provider: string,
    serviceName: string,
    inputCount: number,
    previousOutputCount: number,
    createdAt: number,
    nonce: number
): Promise<RequestStruct> {
    const hash = ethers.solidityPackedKeccak256(
        ["address", "address", "string", "uint", "uint", "uint", "uint"],
        [provider, userAddress, serviceName, inputCount, previousOutputCount, nonce, createdAt]
    );

    const signature = await signer.signMessage(ethers.toBeArray(hash));

    return {
        userAddress,
        serviceName,
        inputCount,
        previousOutputCount,
        createdAt,
        nonce,
        signature,
    };
}
