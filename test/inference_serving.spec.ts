import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { Block, TransactionReceipt } from "ethers";
import { deployments, ethers } from "hardhat";
import { Deployment } from "hardhat-deploy/types";
import { beforeEach } from "mocha";
import {
    doubleSpendingInProof,
    doubleSpendingProofInputs,
    insufficientBalanceInProof,
    insufficientBalanceProofInputs,
    publicKey,
    resPublicKey,
    succeedFee,
    succeedInProof,
    succeedProofInputs,
} from "../src/utils/zk_settlement_calldata/golden";
import { InferenceServing as Serving, LedgerManager } from "../typechain-types";
import {
    AccountStructOutput,
    ServiceStructOutput,
    VerifierInputStruct,
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

    describe("Settle fees", () => {
        it("should succeed", async () => {
            serving.connect(owner).acknowledgeProviderSigner(provider1Address, resPublicKey);
            serving.connect(user1).acknowledgeProviderSigner(provider1Address, resPublicKey);

            const verifierInput: VerifierInputStruct = {
                inProof: succeedInProof,
                proofInputs: succeedProofInputs,
                numChunks: BigInt(2),
                segmentSize: [BigInt(9), BigInt(9)],
            };

            await expect(serving.connect(provider1).settleFees(verifierInput))
                .to.emit(serving, "BalanceUpdated")
                .withArgs(ownerAddress, provider1Address, ownerInitialInferenceBalance - succeedFee, 0)
                .and.to.emit(serving, "BalanceUpdated")
                .withArgs(user1Address, provider1Address, user1InitialInferenceBalance - succeedFee, 0);
        });

        it("should failed due to double spending", async () => {
            const verifierInput: VerifierInputStruct = {
                inProof: doubleSpendingInProof,
                proofInputs: doubleSpendingProofInputs,
                numChunks: BigInt(2),
                segmentSize: [BigInt(14)],
            };

            await expect(serving.connect(provider1).settleFees(verifierInput)).to.be.reverted;
        });

        it("should failed due to insufficient balance", async () => {
            const verifierInput: VerifierInputStruct = {
                inProof: insufficientBalanceInProof,
                proofInputs: insufficientBalanceProofInputs,
                numChunks: BigInt(1),
                segmentSize: [BigInt(7)],
            };

            await expect(serving.connect(provider1).settleFees(verifierInput)).to.be.reverted;
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
