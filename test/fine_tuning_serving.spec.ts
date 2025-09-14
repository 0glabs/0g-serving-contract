import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { Block, ethers as newEthers, TransactionReceipt } from "ethers";
import { deployments, ethers } from "hardhat";
import { Deployment } from "hardhat-deploy/types";
import { beforeEach } from "mocha";
// Mock public key for testing - just a placeholder as ZK is no longer used
const publicKey: [bigint, bigint] = [BigInt(1), BigInt(2)];
import { FineTuningServing as Serving, LedgerManager } from "../typechain-types";
import {
    AccountStructOutput,
    QuotaStruct,
    ServiceStructOutput,
    VerifierInputStruct,
} from "../typechain-types/contracts/fine-tuning/FineTuningServing.sol/FineTuningServing";

describe("Fine tuning serving", () => {
    let serving: Serving;
    let servingDeployment: Deployment;
    let ledger: LedgerManager;
    let LedgerManagerDeployment: Deployment;
    let owner: HardhatEthersSigner,
        user1: HardhatEthersSigner,
        provider1: HardhatEthersSigner,
        provider2: HardhatEthersSigner;
    let ownerAddress: string, user1Address: string, provider1Address: string, provider2Address: string;

    const walletMockTEE = ethers.Wallet.createRandom();
    const providerPrivateKey = walletMockTEE.privateKey;

    const ownerInitialLedgerBalance = 1000;
    const ownerInitialFineTuningBalance = ownerInitialLedgerBalance / 4;

    const user1InitialLedgerBalance = 2000;
    const user1InitialFineTuningBalance = user1InitialLedgerBalance / 4;
    const lockTime = 24 * 60 * 60;
    const defaultPenaltyPercentage = 30;

    const provider1Quota: QuotaStruct = {
        cpuCount: BigInt(8),
        nodeMemory: BigInt(32),
        gpuCount: BigInt(1),
        nodeStorage: BigInt(50000),
        gpuType: "H100",
    };
    const provider1PricePerToken = 100;
    const provider1Url = "https://example-1.com";
    const provider1Signer = walletMockTEE.address;

    const provider2Quota: QuotaStruct = {
        cpuCount: BigInt(8),
        nodeMemory: BigInt(32),
        gpuCount: BigInt(1),
        nodeStorage: BigInt(50000),
        gpuType: "H100",
    };
    const provider2PricePerToken = 100;
    const provider2Url = "https://example-2.com";
    const provider2Signer = walletMockTEE.address;

    const additionalData = "";

    beforeEach(async () => {
        await deployments.fixture(["compute-network"]);
        servingDeployment = await deployments.get("FineTuningServing");
        LedgerManagerDeployment = await deployments.get("LedgerManager");
        serving = await ethers.getContractAt("FineTuningServing", servingDeployment.address);
        ledger = await ethers.getContractAt("LedgerManager", LedgerManagerDeployment.address);

        [owner, user1, provider1, provider2] = await ethers.getSigners();
        [ownerAddress, user1Address, provider1Address, provider2Address] = await Promise.all([
            owner.getAddress(),
            user1.getAddress(),
            provider1.getAddress(),
            provider2.getAddress(),
        ]);
    });

    beforeEach(async () => {
        await Promise.all([
            ledger.addLedger(publicKey, additionalData, {
                value: ownerInitialLedgerBalance,
            }),
            ledger.connect(user1).addLedger(publicKey, additionalData, {
                value: user1InitialLedgerBalance,
            }),
        ]);

        await Promise.all([
            ledger.transferFund(provider1Address, "fine-tuning", ownerInitialFineTuningBalance),
            ledger.connect(user1).transferFund(provider1Address, "fine-tuning", user1InitialFineTuningBalance),

            serving
                .connect(provider1)
                .addOrUpdateService(provider1Url, provider1Quota, provider1PricePerToken, provider1Signer, false, []),
            serving
                .connect(provider2)
                .addOrUpdateService(provider2Url, provider2Quota, provider2PricePerToken, provider2Signer, false, []),
        ]);
    });

    describe("Owner", () => {
        it("should succeed in updating lock time succeed", async () => {
            const updatedLockTime = 2 * 24 * 60 * 60;
            await expect(serving.connect(owner).updateLockTime(updatedLockTime)).not.to.be.reverted;

            const result = await serving.lockTime();
            expect(result).to.equal(BigInt(updatedLockTime));
        });

        it("should succeed in updating penalty percentage succeed", async () => {
            const updatedPenaltyPercentage = 60;
            await expect(serving.connect(owner).updatePenaltyPercentage(updatedPenaltyPercentage)).not.to.be.reverted;

            const result = await serving.penaltyPercentage();
            expect(result).to.equal(BigInt(updatedPenaltyPercentage));
        });
    });

    describe("User", () => {
        it("should fail to update the lock time if it is not the owner", async () => {
            const updatedLockTime = 2 * 24 * 60 * 60;
            await expect(serving.connect(user1).updateLockTime(updatedLockTime)).to.be.reverted;
            const result = await serving.lockTime();
            expect(result).to.equal(BigInt(lockTime));
        });

        it("should fail to update the penalty percentage if it is not the owner", async () => {
            const updatedPenaltyPercentage = 60;
            await expect(serving.connect(user1).updatePenaltyPercentage(updatedPenaltyPercentage)).to.be.reverted;
            const result = await serving.penaltyPercentage();
            expect(result).to.equal(BigInt(defaultPenaltyPercentage));
        });

        it("should transfer fund and update balance", async () => {
            const transferAmount = (ownerInitialLedgerBalance - ownerInitialFineTuningBalance) / 3;
            await ledger.transferFund(provider1Address, "fine-tuning", transferAmount);

            const account = await serving.getAccount(ownerAddress, provider1);
            expect(account.balance).to.equal(BigInt(ownerInitialFineTuningBalance + transferAmount));
        });

        it("should get all users", async () => {
            const accounts = await serving.getAllAccounts();
            const userAddresses = (accounts as AccountStructOutput[]).map((a) => a.user);
            const providerAddresses = (accounts as AccountStructOutput[]).map((a) => a.provider);
            const balances = (accounts as AccountStructOutput[]).map((a) => a.balance);

            expect(userAddresses).to.have.members([ownerAddress, user1Address]);
            expect(providerAddresses).to.have.members([provider1Address, provider1Address]);
            expect(balances).to.have.members([
                BigInt(ownerInitialFineTuningBalance),
                BigInt(user1InitialFineTuningBalance),
            ]);
        });

        it("should get accounts by provider", async () => {
            // Add another provider for testing
            await ledger.transferFund(provider2Address, "fine-tuning", ownerInitialFineTuningBalance);
            
            const [accounts1, total1] = await serving.getAccountsByProvider(provider1Address, 0, 0);
            const [accounts2, total2] = await serving.getAccountsByProvider(provider2Address, 0, 0);
            
            expect(total1).to.equal(BigInt(2)); // owner and user1 with provider1
            expect(total2).to.equal(BigInt(1)); // only owner with provider2
            expect(accounts1.length).to.equal(2);
            expect(accounts2.length).to.equal(1);
            
            const provider1Users = accounts1.map((a) => a.user);
            const provider2Users = accounts2.map((a) => a.user);
            expect(provider1Users).to.have.members([ownerAddress, user1Address]);
            expect(provider2Users).to.have.members([ownerAddress]);
        });

        it("should get accounts by provider with pagination", async () => {
            const [accounts, total] = await serving.getAccountsByProvider(provider1Address, 0, 1);
            
            expect(total).to.equal(BigInt(2));
            expect(accounts.length).to.equal(1);
            
            const [accounts2, total2] = await serving.getAccountsByProvider(provider1Address, 1, 1);
            expect(total2).to.equal(BigInt(2));
            expect(accounts2.length).to.equal(1);
            
            // Check that we get different accounts
            expect(accounts[0].user).to.not.equal(accounts2[0].user);
        });

        it("should get accounts by user", async () => {
            // Add another provider for testing
            await ledger.transferFund(provider2Address, "fine-tuning", ownerInitialFineTuningBalance);
            
            const [ownerAccounts, ownerTotal] = await serving.getAccountsByUser(ownerAddress, 0, 0);
            const [user1Accounts, user1Total] = await serving.getAccountsByUser(user1Address, 0, 0);
            
            expect(ownerTotal).to.equal(BigInt(2)); // owner with provider1 and provider2
            expect(user1Total).to.equal(BigInt(1)); // user1 only with provider1
            expect(ownerAccounts.length).to.equal(2);
            expect(user1Accounts.length).to.equal(1);
            
            const ownerProviders = ownerAccounts.map((a) => a.provider);
            const user1Providers = user1Accounts.map((a) => a.provider);
            expect(ownerProviders).to.have.members([provider1Address, provider2Address]);
            expect(user1Providers).to.have.members([provider1Address]);
        });

        it("should get batch accounts by users", async () => {
            const accounts = await serving.connect(provider1).getBatchAccountsByUsers([ownerAddress, user1Address]);
            
            expect(accounts.length).to.equal(2);
            expect(accounts[0].user).to.equal(ownerAddress);
            expect(accounts[1].user).to.equal(user1Address);
            expect(accounts[0].provider).to.equal(provider1Address);
            expect(accounts[1].provider).to.equal(provider1Address);
        });

        it("should handle batch accounts with non-existent users", async () => {
            const nonExistentUser = ethers.Wallet.createRandom().address;
            const accounts = await serving.connect(provider1).getBatchAccountsByUsers([ownerAddress, nonExistentUser, user1Address]);
            
            expect(accounts.length).to.equal(3);
            expect(accounts[0].user).to.equal(ownerAddress);
            expect(accounts[1].user).to.equal("0x0000000000000000000000000000000000000000"); // non-existent should be zero
            expect(accounts[2].user).to.equal(user1Address);
        });

        it("should enforce pagination limits", async () => {
            await expect(serving.getAccountsByProvider(provider1Address, 0, 51)).to.be.revertedWith("Limit too large");
            await expect(serving.getAccountsByUser(ownerAddress, 0, 51)).to.be.revertedWith("Limit too large");
        });
    });

    describe("Process refund", () => {
        let unlockTime: number;

        beforeEach(async () => {
            const res = await ledger.retrieveFund([provider1Address], "fine-tuning");
            const receipt = await res.wait();

            const block = await ethers.provider.getBlock((receipt as TransactionReceipt).blockNumber);
            unlockTime = (block as Block).timestamp + lockTime;
        });

        it("should succeeded if the unlockTime has arrived and called", async () => {
            await time.increaseTo(unlockTime);

            await ledger.retrieveFund([provider1Address], "fine-tuning");
            const account = await serving.getAccount(ownerAddress, provider1);
            expect(account.balance).to.be.equal(BigInt(0));
        });
    });

    describe("Service provider", () => {
        it("should get service", async () => {
            const service = await serving.getService(provider1Address);

            expect(service.url).to.equal(provider1Url);
            expect(service.quota.cpuCount).to.equal(provider1Quota.cpuCount);
            expect(service.quota.nodeMemory).to.equal(provider1Quota.nodeMemory);
            expect(service.quota.gpuCount).to.equal(provider1Quota.gpuCount);
            expect(service.quota.nodeStorage).to.equal(provider1Quota.nodeStorage);
            expect(service.quota.gpuType).to.equal(provider1Quota.gpuType);
            expect(service.pricePerToken).to.equal(provider1PricePerToken);
            expect(service.providerSigner).to.equal(provider1Signer);
            expect(service.occupied).to.equal(false);
        });

        it("should get all services", async () => {
            const services = await serving.getAllServices();
            const addresses = (services as ServiceStructOutput[]).map((s) => s.provider);
            const urls = (services as ServiceStructOutput[]).map((s) => s.url);
            const pricePerTokens = (services as ServiceStructOutput[]).map((s) => s.pricePerToken);
            const providerSigners = (services as ServiceStructOutput[]).map((s) => s.providerSigner);
            const occupieds = (services as ServiceStructOutput[]).map((s) => s.occupied);

            expect(addresses).to.have.members([provider1Address, provider2Address]);
            expect(urls).to.have.members([provider1Url, provider2Url]);
            expect(pricePerTokens).to.have.members([BigInt(provider1PricePerToken), BigInt(provider2PricePerToken)]);
            expect(providerSigners).to.have.members([provider1Signer, provider2Signer]);
            expect(occupieds).to.have.members([false, false]);
        });

        it("should update service", async () => {
            const modifiedPriceUrl = "https://example-modified.com";
            const modifiedQuota: QuotaStruct = {
                cpuCount: BigInt(16),
                nodeMemory: BigInt(64),
                gpuCount: BigInt(2),
                nodeStorage: BigInt(100000),
                gpuType: "H200",
            };
            const modifiedPricePerToken = 200;
            const modifiedProviderSinger = "0xabcdef1234567890abcdef1234567890abcdef12";
            const modifiedOccupied = true;
            const modifiedModels = ["model"];

            await expect(
                serving
                    .connect(provider1)
                    .addOrUpdateService(
                        modifiedPriceUrl,
                        modifiedQuota,
                        modifiedPricePerToken,
                        modifiedProviderSinger,
                        modifiedOccupied,
                        modifiedModels
                    )
            )
                .to.emit(serving, "ServiceUpdated")
                .withArgs(
                    provider1Address,
                    modifiedPriceUrl,
                    Object.values(modifiedQuota),
                    modifiedPricePerToken,
                    (providerSinger: string) => {
                        return providerSinger.toLowerCase() === modifiedProviderSinger;
                    },
                    modifiedOccupied
                );

            const service = await serving.getService(provider1Address);

            expect(service.url).to.equal(modifiedPriceUrl);
            expect(service.quota.cpuCount).to.equal(modifiedQuota.cpuCount);
            expect(service.quota.nodeMemory).to.equal(modifiedQuota.nodeMemory);
            expect(service.quota.gpuCount).to.equal(modifiedQuota.gpuCount);
            expect(service.quota.nodeStorage).to.equal(modifiedQuota.nodeStorage);
            expect(service.quota.gpuType).to.equal(modifiedQuota.gpuType);
            expect(service.pricePerToken).to.equal(modifiedPricePerToken);
            expect(service.providerSigner.toLowerCase()).to.equal(modifiedProviderSinger);
            expect(service.occupied).to.equal(modifiedOccupied);
            expect(service.models.length).to.equal(modifiedModels.length);
            for (const index in modifiedModels) {
                expect(service.models[index]).to.equal(modifiedModels[index]);
            }
        });

        it("should remove service correctly", async function () {
            await expect(serving.connect(provider1).removeService())
                .to.emit(serving, "ServiceRemoved")
                .withArgs(provider1Address);

            const services = await serving.getAllServices();
            expect(services.length).to.equal(1);
        });
    });

    describe("Settle fees", () => {
        const modelRootHash = "0x1234567890abcdef1234567890abcdef12345678";
        const encryptedSecret = "0x1234567890abcdef1234567890abcdef12345678";
        const taskFee = 10;
        let verifierInput: VerifierInputStruct;

        beforeEach(async () => {
            await serving.acknowledgeProviderSigner(provider1, provider1Signer);
            await serving.connect(provider1).addDeliverable(ownerAddress, modelRootHash);
            await serving.acknowledgeDeliverable(provider1, 0);

            verifierInput = {
                taskFee,
                encryptedSecret,
                modelRootHash,
                index: BigInt(0),
                nonce: BigInt(1),
                providerSigner: provider1Signer,
                user: ownerAddress,
                signature: "",
            };

            verifierInput = await backfillVerifierInput(providerPrivateKey, verifierInput);
        });

        it("should succeed", async () => {
            await expect(serving.connect(provider1).settleFees(verifierInput))
                .to.emit(serving, "BalanceUpdated")
                .withArgs(ownerAddress, provider1Address, ownerInitialFineTuningBalance - taskFee, 0);
        });

        it("should failed due to double spending", async () => {
            await serving.connect(provider1).settleFees(verifierInput);

            await expect(serving.connect(provider1).settleFees(verifierInput)).to.be.reverted;
        });

        it("should failed due to insufficient balance", async () => {
            verifierInput.taskFee = ownerInitialFineTuningBalance + 1;

            await expect(serving.connect(provider1).settleFees(verifierInput)).to.be.reverted;
        });

        it("should failed due to no secret", async () => {
            verifierInput.encryptedSecret = "0x";
            verifierInput = await backfillVerifierInput(providerPrivateKey, verifierInput);
            await expect(serving.connect(provider1).settleFees(verifierInput)).to.be.revertedWith(
                "secret should not be empty"
            );
        });
    });

    describe("Settle not ack fees", () => {
        const modelRootHash = "0x1234567890abcdef1234567890abcdef12345678";
        const encryptedSecret = "0x1234567890abcdef1234567890abcdef12345678";
        const taskFee = 10;
        let verifierInput: VerifierInputStruct;

        beforeEach(async () => {
            await serving.acknowledgeProviderSigner(provider1, provider1Signer);
            await serving.connect(provider1).addDeliverable(ownerAddress, modelRootHash);

            verifierInput = {
                taskFee,
                encryptedSecret: "0x",
                modelRootHash,
                index: BigInt(0),
                nonce: BigInt(1),
                providerSigner: provider1Signer,
                user: ownerAddress,
                signature: "",
            };

            verifierInput = await backfillVerifierInput(providerPrivateKey, verifierInput);
        });

        it("should succeed", async () => {
            await expect(serving.connect(provider1).settleFees(verifierInput))
                .to.emit(serving, "BalanceUpdated")
                .withArgs(
                    ownerAddress,
                    provider1Address,
                    ownerInitialFineTuningBalance - (taskFee * defaultPenaltyPercentage) / 100,
                    0
                );
        });

        it("should failed due to secret", async () => {
            verifierInput.encryptedSecret = encryptedSecret;
            verifierInput = await backfillVerifierInput(providerPrivateKey, verifierInput);
            await expect(serving.connect(provider1).settleFees(verifierInput)).to.be.revertedWith(
                "secret should be empty"
            );
        });
    });

    describe("deleteAccount", () => {
        it("should delete account", async () => {
            await expect(ledger.deleteLedger()).not.to.be.reverted;
            const accounts = await serving.getAllAccounts();
            expect(accounts.length).to.equal(1);
        });
    });
});

async function backfillVerifierInput(privateKey: string, v: VerifierInputStruct): Promise<VerifierInputStruct> {
    const wallet = new newEthers.Wallet(privateKey);

    const hash = newEthers.solidityPackedKeccak256(
        ["bytes", "bytes", "uint256", "address", "uint256", "address"],
        [v.encryptedSecret, v.modelRootHash, v.nonce, v.providerSigner, v.taskFee, v.user]
    );

    v.signature = await wallet.signMessage(ethers.toBeArray(hash));
    return v;
}
