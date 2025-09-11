import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { Block, TransactionReceipt } from "ethers";
import { deployments, ethers } from "hardhat";
import { Deployment } from "hardhat-deploy/types";
import { beforeEach } from "mocha";
// Mock public key for testing - just a placeholder as ZK is no longer used
const publicKey: [bigint, bigint] = [BigInt(1), BigInt(2)];
import { InferenceServing as Serving, LedgerManager } from "../typechain-types";
import {
    AccountStructOutput,
    ServiceStructOutput,
    TEESettlementDataStruct,
} from "../typechain-types/contracts/inference/InferenceServing.sol/InferenceServing";

describe("Inference Serving", () => {
    let serving: Serving;
    let servingDeployment: Deployment;
    let ledger: LedgerManager;
    let LedgerManagerDeployment: Deployment;
    let owner: HardhatEthersSigner,
        user1: HardhatEthersSigner,
        provider1: HardhatEthersSigner,
        provider2: HardhatEthersSigner;
    let ownerAddress: string, user1Address: string, provider1Address: string, provider2Address: string;

    const ownerInitialLedgerBalance = 1000;
    const ownerInitialInferenceBalance = ownerInitialLedgerBalance / 4;

    const user1InitialLedgerBalance = 2000;
    const user1InitialInferenceBalance = user1InitialLedgerBalance / 4;
    const lockTime = 24 * 60 * 60;

    const provider1ServiceType = "HTTP";
    const provider1InputPrice = 100;
    const provider1OutputPrice = 100;
    const provider1Url = "https://example-1.com";
    const provider1Model = "llama-8b";
    const provider1Verifiability = "SPML";

    const provider2ServiceType = "HTTP";
    const provider2InputPrice = 100;
    const provider2OutputPrice = 100;
    const provider2Url = "https://example-2.com";
    const provider2Model = "phi-3-mini-4k-instruct";
    const provider2Verifiability = "TeeML";

    const additionalData = "U2FsdGVkX18cuPVgRkw/sHPq2YzJE5MyczGO0vOTQBBiS9A4Pka5woWK82fZr0Xjh8mDhjlW9ARsX6e6sKDChg==";

    beforeEach(async () => {
        await deployments.fixture(["compute-network"]);
        servingDeployment = await deployments.get("InferenceServing");
        LedgerManagerDeployment = await deployments.get("LedgerManager");
        serving = await ethers.getContractAt("InferenceServing", servingDeployment.address);
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
            ledger.transferFund(provider1Address, "inference", ownerInitialInferenceBalance),
            ledger.connect(user1).transferFund(provider1Address, "inference", user1InitialInferenceBalance),

            serving.connect(provider1).addOrUpdateService({
                serviceType: provider1ServiceType,
                url: provider1Url,
                model: provider1Model,
                verifiability: provider1Verifiability,
                inputPrice: provider1InputPrice,
                outputPrice: provider1OutputPrice,
                additionalInfo: "",
            }),
            serving.connect(provider2).addOrUpdateService({
                serviceType: provider2ServiceType,
                url: provider2Url,
                model: provider2Model,
                verifiability: provider2Verifiability,
                inputPrice: provider2InputPrice,
                outputPrice: provider2OutputPrice,
                additionalInfo: "",
            }),
        ]);
    });

    describe("Owner", () => {
        it("should succeed in updating lock time succeed", async () => {
            const updatedLockTime = 2 * 24 * 60 * 60;
            await expect(serving.connect(owner).updateLockTime(updatedLockTime)).not.to.be.reverted;

            const result = await serving.lockTime();
            expect(result).to.equal(BigInt(updatedLockTime));
        });
    });

    describe("User", () => {
        it("should fail to update the lock time if it is not the owner", async () => {
            const updatedLockTime = 2 * 24 * 60 * 60;
            await expect(serving.connect(user1).updateLockTime(updatedLockTime)).to.be.reverted;
            const result = await serving.lockTime();
            expect(result).to.equal(BigInt(lockTime));
        });

        it("should transfer fund and update balance", async () => {
            const transferAmount = (ownerInitialLedgerBalance - ownerInitialInferenceBalance) / 3;
            await ledger.transferFund(provider1Address, "inference", transferAmount);

            const account = await serving.getAccount(ownerAddress, provider1);
            expect(account.balance).to.equal(BigInt(ownerInitialInferenceBalance + transferAmount));
        });

        it("should get all users", async () => {
            const accounts = await serving.getAllAccounts();
            const userAddresses = (accounts as AccountStructOutput[]).map((a) => a.user);
            const providerAddresses = (accounts as AccountStructOutput[]).map((a) => a.provider);
            const balances = (accounts as AccountStructOutput[]).map((a) => a.balance);

            expect(userAddresses).to.have.members([ownerAddress, user1Address]);
            expect(providerAddresses).to.have.members([provider1Address, provider1Address]);
            expect(balances).to.have.members([
                BigInt(ownerInitialInferenceBalance),
                BigInt(user1InitialInferenceBalance),
            ]);
        });

        it("should get accounts by provider", async () => {
            // Add another provider for testing
            await ledger.transferFund(provider2Address, "inference", ownerInitialInferenceBalance);
            
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
            await ledger.transferFund(provider2Address, "inference", ownerInitialInferenceBalance);
            
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
            const res = await ledger.retrieveFund([provider1Address], "inference");
            const receipt = await res.wait();

            const block = await ethers.provider.getBlock((receipt as TransactionReceipt).blockNumber);
            unlockTime = (block as Block).timestamp + lockTime;
        });

        it("should succeeded if the unlockTime has arrived and called", async () => {
            await time.increaseTo(unlockTime);

            await ledger.retrieveFund([provider1Address], "inference");
            const account = await serving.getAccount(ownerAddress, provider1);
            expect(account.balance).to.be.equal(BigInt(0));
        });
    });

    describe("Service provider", () => {
        it("should get service", async () => {
            const service = await serving.getService(provider1Address);

            expect(service.serviceType).to.equal(provider1ServiceType);
            expect(service.url).to.equal(provider1Url);
            expect(service.model).to.equal(provider1Model);
            expect(service.verifiability).to.equal(provider1Verifiability);
            expect(service.inputPrice).to.equal(provider1InputPrice);
            expect(service.outputPrice).to.equal(provider1OutputPrice);
            expect(service.updatedAt).to.not.equal(0);
        });

        it("should get all services", async () => {
            const services = await serving.getAllServices();
            const addresses = (services as ServiceStructOutput[]).map((s) => s.provider);
            const serviceTypes = (services as ServiceStructOutput[]).map((s) => s.serviceType);
            const urls = (services as ServiceStructOutput[]).map((s) => s.url);
            const models = (services as ServiceStructOutput[]).map((s) => s.model);
            const allVerifiability = (services as ServiceStructOutput[]).map((s) => s.verifiability);
            const inputPrices = (services as ServiceStructOutput[]).map((s) => s.inputPrice);
            const outputPrices = (services as ServiceStructOutput[]).map((s) => s.outputPrice);
            const updatedAts = (services as ServiceStructOutput[]).map((s) => s.updatedAt);

            expect(addresses).to.have.members([provider1Address, provider2Address]);
            expect(serviceTypes).to.have.members([provider1ServiceType, provider2ServiceType]);
            expect(urls).to.have.members([provider1Url, provider2Url]);
            expect(models).to.have.members([provider1Model, provider2Model]);
            expect(allVerifiability).to.have.members([provider1Verifiability, provider2Verifiability]);
            expect(inputPrices).to.have.members([BigInt(provider1InputPrice), BigInt(provider2InputPrice)]);
            expect(outputPrices).to.have.members([BigInt(provider1OutputPrice), BigInt(provider2OutputPrice)]);
            expect(updatedAts[0]).to.not.equal(0);
            expect(updatedAts[1]).to.not.equal(0);
        });

        it("should update service", async () => {
            const modifiedServiceType = "RPC";
            const modifiedPriceUrl = "https://example-modified.com";
            const modifiedModel = "llama-13b";
            const modifiedVerifiability = "TeeML";
            const modifiedInputPrice = 200;
            const modifiedOutputPrice = 300;

            await expect(
                serving.connect(provider1).addOrUpdateService({
                    serviceType: modifiedServiceType,
                    url: modifiedPriceUrl,
                    model: modifiedModel,
                    verifiability: modifiedVerifiability,
                    inputPrice: modifiedInputPrice,
                    outputPrice: modifiedOutputPrice,
                    additionalInfo: "",
                })
            )
                .to.emit(serving, "ServiceUpdated")
                .withArgs(
                    provider1Address,
                    modifiedServiceType,
                    modifiedPriceUrl,
                    modifiedInputPrice,
                    modifiedOutputPrice,
                    anyValue,
                    modifiedModel,
                    modifiedVerifiability
                );

            const service = await serving.getService(provider1Address);

            expect(service.serviceType).to.equal(modifiedServiceType);
            expect(service.url).to.equal(modifiedPriceUrl);
            expect(service.model).to.equal(modifiedModel);
            expect(service.verifiability).to.equal(modifiedVerifiability);
            expect(service.inputPrice).to.equal(modifiedInputPrice);
            expect(service.outputPrice).to.equal(modifiedOutputPrice);
            expect(service.updatedAt).to.not.equal(0);
        });

        it("should remove service correctly", async function () {
            await expect(serving.connect(provider1).removeService())
                .to.emit(serving, "ServiceRemoved")
                .withArgs(provider1Address);

            const services = await serving.getAllServices();
            expect(services.length).to.equal(1);
        });
    });

    describe("TEE Settlement", () => {
        const testFee = 50;
        const testRequestsHash = ethers.keccak256(ethers.toUtf8Bytes("test_requests_hash"));
        
        // Create a separate wallet for TEE signing
        const teePrivateKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
        const teeWallet = new ethers.Wallet(teePrivateKey);
        const teeSignerAddress = teeWallet.address;
        
        beforeEach(async () => {
            // Acknowledge TEE signer for both users - using a dedicated TEE signer
            await serving.connect(owner).acknowledgeTEESigner(provider1Address, teeSignerAddress);
            await serving.connect(user1).acknowledgeTEESigner(provider1Address, teeSignerAddress);
        });
        
        async function createValidTEESettlement(
            user: string,
            provider: string, 
            totalFee: bigint,
            requestsHash: string,
            nonce: bigint
        ): Promise<TEESettlementDataStruct> {
            // Create message hash exactly like the contract
            const messageHash = ethers.solidityPackedKeccak256(
                ["bytes32", "uint256", "address", "address", "uint256"],
                [requestsHash, nonce, provider, user, totalFee]
            );
            
            // Sign using the exact same approach as fine_tuning_serving.spec.ts backfillVerifierInput
            const signature = await teeWallet.signMessage(ethers.toBeArray(messageHash));
            
            return {
                user,
                provider,
                totalFee,
                requestsHash,
                nonce,
                signature
            };
        }
        
        it("should succeed with valid TEE settlement", async () => {
            const nonce = BigInt(Date.now());
            const settlement = await createValidTEESettlement(
                ownerAddress,
                provider1Address,
                BigInt(testFee),
                testRequestsHash,
                nonce
            );

            // Get initial balance
            const initialBalance = await serving.getAccount(ownerAddress, provider1Address);
            
            // Execute settlement and verify success
            await expect(serving.connect(provider1).settleFeesWithTEE([settlement]))
                .to.emit(serving, "TEESettlementCompleted")
                .withArgs(provider1Address, 1, 0); // 1 success, 0 failures
            
            // Verify balance was deducted
            const finalBalance = await serving.getAccount(ownerAddress, provider1Address);
            expect(finalBalance.balance).to.equal(initialBalance.balance - BigInt(testFee));
            expect(finalBalance.nonce).to.equal(nonce);
        });



        it("should handle multiple settlements in batch", async () => {
            const nonce1 = BigInt(Date.now());
            const nonce2 = nonce1 + BigInt(1);
            
            const settlement1 = await createValidTEESettlement(
                ownerAddress,
                provider1Address,
                BigInt(testFee),
                testRequestsHash,
                nonce1
            );

            const settlement2 = await createValidTEESettlement(
                user1Address,
                provider1Address,
                BigInt(testFee),
                testRequestsHash,
                nonce2
            );

            // Get initial balances
            const initialBalance1 = await serving.getAccount(ownerAddress, provider1Address);
            const initialBalance2 = await serving.getAccount(user1Address, provider1Address);
            
            // Execute batch settlement - both should succeed
            await expect(serving.connect(provider1).settleFeesWithTEE([settlement1, settlement2]))
                .to.emit(serving, "TEESettlementCompleted")
                .withArgs(provider1Address, 2, 0); // 2 successes, 0 failures
            
            // Verify both balances were deducted
            const finalBalance1 = await serving.getAccount(ownerAddress, provider1Address);
            const finalBalance2 = await serving.getAccount(user1Address, provider1Address);
            expect(finalBalance1.balance).to.equal(initialBalance1.balance - BigInt(testFee));
            expect(finalBalance2.balance).to.equal(initialBalance2.balance - BigInt(testFee));
        });

        it("should handle insufficient balance gracefully", async () => {
            const excessiveFee = ownerInitialInferenceBalance + 1000;
            const nonce = BigInt(Date.now());
            
            const settlement = await createValidTEESettlement(
                ownerAddress,
                provider1Address,
                BigInt(excessiveFee),
                testRequestsHash,
                nonce
            );

            // Get initial balance to verify it doesn't change after failed settlement
            const initialBalance = await serving.getAccount(ownerAddress, provider1Address);

            // Execute settlement - should fail due to insufficient balance
            await expect(serving.connect(provider1).settleFeesWithTEE([settlement]))
                .to.emit(serving, "TEESettlementCompleted")
                .withArgs(provider1Address, 0, 1) // 0 successes, 1 failure
                .and.to.emit(serving, "TEESettlementFailed")
                .withArgs(provider1Address, ownerAddress, "Insufficient balance");
            
            // Verify balance unchanged (settlement failed)
            const finalBalance = await serving.getAccount(ownerAddress, provider1Address);
            expect(finalBalance.balance).to.equal(initialBalance.balance);
            expect(finalBalance.nonce).to.equal(initialBalance.nonce); // Nonce shouldn't update on failure
        });

        it("should handle mixed success and failure in batch settlement", async () => {
            const nonce1 = BigInt(Date.now());
            const nonce2 = nonce1 + BigInt(1);
            
            // Create settlement with sufficient balance (should potentially succeed)
            const potentialSuccessSettlement = await createValidTEESettlement(
                user1Address,
                provider1Address,
                BigInt(testFee),
                testRequestsHash,
                nonce1
            );

            // Create settlement with insufficient balance (should definitely fail)
            const excessiveFee = ownerInitialInferenceBalance + 1000;
            const definiteFailSettlement = await createValidTEESettlement(
                ownerAddress,
                provider1Address,
                BigInt(excessiveFee),
                testRequestsHash,
                nonce2
            );

            // Get initial balances
            const initialBalance1 = await serving.getAccount(user1Address, provider1Address);
            const initialBalance2 = await serving.getAccount(ownerAddress, provider1Address);
            
            // Execute mixed batch - one success, one failure
            await expect(serving.connect(provider1).settleFeesWithTEE([potentialSuccessSettlement, definiteFailSettlement]))
                .to.emit(serving, "TEESettlementCompleted")
                .withArgs(provider1Address, 1, 1) // 1 success, 1 failure
                .and.to.emit(serving, "TEESettlementFailed")
                .withArgs(provider1Address, ownerAddress, "Insufficient balance");
            
            // Verify user1 succeeded (balance deducted), owner failed (balance unchanged)
            const finalBalance1 = await serving.getAccount(user1Address, provider1Address);
            const finalBalance2 = await serving.getAccount(ownerAddress, provider1Address);
            expect(finalBalance1.balance).to.equal(initialBalance1.balance - BigInt(testFee)); // User1 succeeded
            expect(finalBalance2.balance).to.equal(initialBalance2.balance); // Owner failed
        });

        it("should fail with invalid signature", async () => {
            const settlement: TEESettlementDataStruct = {
                user: ownerAddress,
                provider: provider1Address,
                totalFee: BigInt(testFee),
                requestsHash: testRequestsHash,
                nonce: BigInt(Date.now()),
                signature: "0x" + "00".repeat(65) // Invalid mock signature
            };

            // Get initial balance to verify it doesn't change after failed settlement
            const initialBalance = await serving.getAccount(ownerAddress, provider1Address);

            // Execute settlement - should fail due to invalid signature
            await expect(serving.connect(provider1).settleFeesWithTEE([settlement]))
                .to.emit(serving, "TEESettlementCompleted")
                .withArgs(provider1Address, 0, 1) // 0 successes, 1 failure
                .and.to.emit(serving, "TEESettlementFailed")
                .withArgs(provider1Address, ownerAddress, anyValue);
            
            // Verify balance unchanged (settlement failed)
            const finalBalance = await serving.getAccount(ownerAddress, provider1Address);
            expect(finalBalance.balance).to.equal(initialBalance.balance);
            expect(finalBalance.nonce).to.equal(initialBalance.nonce); // Nonce shouldn't update on failure
        });


        it("should prevent duplicate nonce usage", async () => {
            const nonce = BigInt(Date.now());
            
            const settlement1 = await createValidTEESettlement(
                ownerAddress,
                provider1Address,
                BigInt(testFee),
                testRequestsHash,
                nonce
            );

            // Get initial balance
            const initialBalance = await serving.getAccount(ownerAddress, provider1Address);
            
            // First settlement should succeed
            await expect(serving.connect(provider1).settleFeesWithTEE([settlement1]))
                .to.emit(serving, "TEESettlementCompleted")
                .withArgs(provider1Address, 1, 0); // 1 success, 0 failures
            
            // Verify first settlement succeeded
            const balanceAfterFirst = await serving.getAccount(ownerAddress, provider1Address);
            expect(balanceAfterFirst.balance).to.equal(initialBalance.balance - BigInt(testFee));
            expect(balanceAfterFirst.nonce).to.equal(nonce);

            // Second settlement with same nonce should fail
            const settlement2 = await createValidTEESettlement(
                ownerAddress,
                provider1Address,
                BigInt(testFee),
                testRequestsHash,
                nonce // Same nonce
            );

            // Execute second settlement - should fail due to duplicate nonce
            await expect(serving.connect(provider1).settleFeesWithTEE([settlement2]))
                .to.emit(serving, "TEESettlementCompleted")
                .withArgs(provider1Address, 0, 1) // 0 successes, 1 failure
                .and.to.emit(serving, "TEESettlementFailed")
                .withArgs(provider1Address, ownerAddress, "Nonce already processed");
            
            // Verify balance unchanged after failed second settlement
            const finalBalance = await serving.getAccount(ownerAddress, provider1Address);
            expect(finalBalance.balance).to.equal(balanceAfterFirst.balance);
        });

        it("should revert with empty settlements array", async () => {
            await expect(serving.connect(provider1).settleFeesWithTEE([]))
                .to.be.revertedWith("No settlements provided");
        });

        it("should handle provider mismatch", async () => {
            const nonce = BigInt(Date.now());
            
            const settlement = await createValidTEESettlement(
                ownerAddress,
                provider2Address, // Different provider than the one calling
                BigInt(testFee),
                testRequestsHash,
                nonce
            );

            // Get initial balance from provider1 (the one we'll call with)
            const initialBalance = await serving.getAccount(ownerAddress, provider1Address);

            // Execute settlement - should fail due to provider mismatch
            await expect(serving.connect(provider1).settleFeesWithTEE([settlement]))
                .to.emit(serving, "TEESettlementCompleted")
                .withArgs(provider1Address, 0, 1) // 0 successes, 1 failure
                .and.to.emit(serving, "TEESettlementFailed")
                .withArgs(provider1Address, ownerAddress, "Provider mismatch");
            
            // Verify balance unchanged with provider1 (settlement failed)
            const finalBalance = await serving.getAccount(ownerAddress, provider1Address);
            expect(finalBalance.balance).to.equal(initialBalance.balance);
            expect(finalBalance.nonce).to.equal(initialBalance.nonce);
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
