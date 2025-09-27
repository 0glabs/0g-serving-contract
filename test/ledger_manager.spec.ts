import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { Block, TransactionReceipt } from "ethers";
import { deployments, ethers } from "hardhat";
import { Deployment } from "hardhat-deploy/types";
import { beforeEach } from "mocha";
// Mock public key for testing - just a placeholder as ZK is no longer used
const publicKey: [bigint, bigint] = [BigInt(1), BigInt(2)];
import { FineTuningServing, InferenceServing, LedgerManager } from "../typechain-types";
import { LedgerStructOutput } from "../typechain-types/contracts/ledger/LedgerManager.sol/LedgerManager";

describe("Ledger manager", () => {
    let inferenceServing: InferenceServing;
    let inferenceServingDeployment: Deployment;

    let fineTuningServing: FineTuningServing;
    let fineTuningServingDeployment: Deployment;

    let ledger: LedgerManager;
    let LedgerManagerDeployment: Deployment;

    let owner: HardhatEthersSigner, user1: HardhatEthersSigner, provider1: HardhatEthersSigner;
    let ownerAddress: string, user1Address: string, provider1Address: string;

    const ownerInitialLedgerBalance = 1000;
    const ownerInitialFineTuningBalance = ownerInitialLedgerBalance / 4;
    const ownerInitialInferenceBalance = ownerInitialLedgerBalance / 4;

    const user1InitialLedgerBalance = 2000;
    const user1InitialFineTuningBalance = user1InitialLedgerBalance / 4;
    const user1InitialInferenceBalance = user1InitialLedgerBalance / 4;
    const lockTime = 24 * 60 * 60;

    const additionalData = "";

    beforeEach(async () => {
        await deployments.fixture(["compute-network"]);
        inferenceServingDeployment = await deployments.get("InferenceServing");
        fineTuningServingDeployment = await deployments.get("FineTuningServing");
        LedgerManagerDeployment = await deployments.get("LedgerManager");

        inferenceServing = await ethers.getContractAt("InferenceServing", inferenceServingDeployment.address);
        fineTuningServing = await ethers.getContractAt("FineTuningServing", fineTuningServingDeployment.address);
        ledger = await ethers.getContractAt("LedgerManager", LedgerManagerDeployment.address);

        [owner, user1, provider1] = await ethers.getSigners();
        [ownerAddress, user1Address, provider1Address] = await Promise.all([
            owner.getAddress(),
            user1.getAddress(),
            provider1.getAddress(),
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
    });

    it("should get all ledgers", async () => {
        const [ledgers, total] = await ledger.getAllLedgers(0, 0); // offset=0, limit=0 means get all
        expect(total).to.equal(BigInt(2));
        const userAddresses = (ledgers as LedgerStructOutput[]).map((a) => a.user);
        const availableBalances = (ledgers as LedgerStructOutput[]).map((a) => a.availableBalance);
        const additionalInfos = (ledgers as LedgerStructOutput[]).map((a) => a.additionalInfo);

        expect(userAddresses).to.have.members([ownerAddress, user1Address]);
        expect(availableBalances).to.have.members([
            BigInt(ownerInitialLedgerBalance),
            BigInt(user1InitialLedgerBalance),
        ]);
        expect(additionalInfos).to.have.members(["", ""]);
    });

    it("should deposit fund", async () => {
        const depositAmount = 1000;
        await ledger.depositFund({
            value: depositAmount,
        });

        const account = await ledger.getLedger(ownerAddress);
        expect(account.availableBalance).to.equal(BigInt(ownerInitialLedgerBalance + depositAmount));
    });

    describe("Transfer fund", () => {
        it("should transfer fund to serving contract", async () => {
            await Promise.all([
                ledger.transferFund(provider1Address, "fine-tuning", ownerInitialFineTuningBalance),
                ledger.transferFund(provider1Address, "inference", ownerInitialInferenceBalance),
                ledger.connect(user1).transferFund(provider1Address, "fine-tuning", user1InitialFineTuningBalance),
                ledger.connect(user1).transferFund(provider1Address, "inference", user1InitialInferenceBalance),
            ]);

            const [ledgers, total] = await ledger.getAllLedgers(0, 0);
            const userAddresses = (ledgers as LedgerStructOutput[]).map((a) => a.user);
            const availableBalances = (ledgers as LedgerStructOutput[]).map((a) => a.availableBalance);
            const inferenceProviders = (ledgers as LedgerStructOutput[]).map((a) => a.inferenceProviders);
            const fineTuningProviders = (ledgers as LedgerStructOutput[]).map((a) => a.fineTuningProviders);

            expect(userAddresses).to.have.members([ownerAddress, user1Address]);
            expect(availableBalances).to.have.members([
                BigInt(ownerInitialLedgerBalance - ownerInitialFineTuningBalance - ownerInitialInferenceBalance),
                BigInt(user1InitialLedgerBalance - user1InitialFineTuningBalance - user1InitialInferenceBalance),
            ]);
            expect(inferenceProviders).to.have.deep.members([[provider1Address], [provider1Address]]);
            expect(fineTuningProviders).to.have.deep.members([[provider1Address], [provider1Address]]);

            const inferenceAccount = await inferenceServing.getAccount(ownerAddress, provider1);
            const fineTuningAccount = await fineTuningServing.getAccount(ownerAddress, provider1);
            expect(inferenceAccount.balance).to.equal(BigInt(ownerInitialInferenceBalance));
            expect(fineTuningAccount.balance).to.equal(BigInt(ownerInitialFineTuningBalance));
        });

        it("should cancel the retrieved fund and transfer the remain fund when transfer fund larger than total retrieved fund", async () => {
            await Promise.all([
                ledger.transferFund(provider1Address, "fine-tuning", ownerInitialFineTuningBalance / 2),
                ledger.transferFund(provider1Address, "inference", ownerInitialInferenceBalance / 2),
            ]);

            await ledger.retrieveFund([provider1Address], "fine-tuning");
            await ledger.retrieveFund([provider1Address], "inference");

            let inferenceAccount = await inferenceServing.getAccount(ownerAddress, provider1);
            let fineTuningAccount = await fineTuningServing.getAccount(ownerAddress, provider1);
            expect(inferenceAccount.balance).to.equal(BigInt(ownerInitialInferenceBalance / 2));
            expect(fineTuningAccount.balance).to.equal(BigInt(ownerInitialFineTuningBalance / 2));
            expect(inferenceAccount.pendingRefund).to.equal(BigInt(ownerInitialInferenceBalance / 2));
            expect(fineTuningAccount.pendingRefund).to.equal(BigInt(ownerInitialFineTuningBalance / 2));

            await Promise.all([
                ledger.transferFund(provider1Address, "fine-tuning", ownerInitialFineTuningBalance),
                ledger.transferFund(provider1Address, "inference", ownerInitialInferenceBalance),
            ]);

            inferenceAccount = await inferenceServing.getAccount(ownerAddress, provider1);
            fineTuningAccount = await fineTuningServing.getAccount(ownerAddress, provider1);
            expect(inferenceAccount.balance).to.equal(BigInt(ownerInitialInferenceBalance));
            expect(fineTuningAccount.balance).to.equal(BigInt(ownerInitialFineTuningBalance));
            expect(inferenceAccount.pendingRefund).to.equal(BigInt(0));
            expect(fineTuningAccount.pendingRefund).to.equal(BigInt(0));
        });

        it("should cancel the retrieved fund even when transfer fund smaller than total retrieved fund", async () => {
            await Promise.all([
                ledger.transferFund(provider1Address, "fine-tuning", ownerInitialFineTuningBalance),
                ledger.transferFund(provider1Address, "inference", ownerInitialInferenceBalance),
            ]);

            await ledger.retrieveFund([provider1Address], "fine-tuning");
            await ledger.retrieveFund([provider1Address], "inference");

            let inferenceAccount = await inferenceServing.getAccount(ownerAddress, provider1);
            let fineTuningAccount = await fineTuningServing.getAccount(ownerAddress, provider1);
            expect(inferenceAccount.balance).to.equal(BigInt(ownerInitialInferenceBalance));
            expect(fineTuningAccount.balance).to.equal(BigInt(ownerInitialFineTuningBalance));
            expect(inferenceAccount.pendingRefund).to.equal(BigInt(ownerInitialInferenceBalance));
            expect(fineTuningAccount.pendingRefund).to.equal(BigInt(ownerInitialFineTuningBalance));

            // The transfer fund is smaller than the total retrieved fund, so only part of the pending refund should be canceled
            await Promise.all([
                ledger.transferFund(provider1Address, "fine-tuning", ownerInitialFineTuningBalance / 2),
                ledger.transferFund(provider1Address, "inference", ownerInitialInferenceBalance / 2),
            ]);

            inferenceAccount = await inferenceServing.getAccount(ownerAddress, provider1);
            fineTuningAccount = await fineTuningServing.getAccount(ownerAddress, provider1);
            expect(inferenceAccount.balance).to.equal(BigInt(ownerInitialInferenceBalance));
            expect(fineTuningAccount.balance).to.equal(BigInt(ownerInitialFineTuningBalance));
            expect(inferenceAccount.pendingRefund).to.equal(BigInt(ownerInitialInferenceBalance / 2));
            expect(fineTuningAccount.pendingRefund).to.equal(BigInt(ownerInitialFineTuningBalance / 2));
        });


        it("should handle array optimization during multiple transfer operations", async () => {
            // Step 1: Setup initial account and create refund
            // Before: balance=0, pendingRefund=0, refunds=[], validRefundsLength=0
            await ledger.transferFund(provider1Address, "fine-tuning", 800);
            // After transfer: balance=800, pendingRefund=0, refunds=[], validRefundsLength=0
            await ledger.retrieveFund([provider1Address], "fine-tuning");
            // After refund request: balance=800, pendingRefund=800, refunds=[{amount:800, processed:false}], validRefundsLength=1
            
            let account = await fineTuningServing.getAccount(ownerAddress, provider1);
            expect(account.refunds.length).to.equal(1);
            expect(account.pendingRefund).to.equal(800);
            
            // Step 2: Transfer with full cancellation
            // Before: balance=800, pendingRefund=800, refunds=[{amount:800, processed:false}]
            await ledger.transferFund(provider1Address, "fine-tuning", 1000);
            // During transfer: cancelRetrievingAmount = min(1000, 800) = 800 (full cancellation)
            // - Entire refund is cancelled: refund marked as processed
            // - PendingRefund becomes 800-800=0
            // After: balance=1000, pendingRefund=0, refunds=[{amount:800, processed:true}], validRefundsLength=0
            
            account = await fineTuningServing.getAccount(ownerAddress, provider1);
            expect(account.pendingRefund).to.equal(0);
            expect(account.balance).to.equal(1000); 
            
            // Step 3: Create new refund - should reuse array position
            // Before: balance=1000, pendingRefund=0, refunds=[dirty_data], validRefundsLength=0
            await ledger.retrieveFund([provider1Address], "fine-tuning");
            // After: balance=1000, pendingRefund=1000, refunds=[{amount:1000, processed:false}], validRefundsLength=1
            // Key optimization: Same array position is REUSED (index 0), no array expansion
            
            account = await fineTuningServing.getAccount(ownerAddress, provider1);
            expect(account.refunds.length).to.equal(1); // Reusing position
            expect(account.pendingRefund).to.equal(1000);
        });
    });

    it("should refund fund", async () => {
        await ledger.transferFund(provider1Address, "fine-tuning", ownerInitialFineTuningBalance);

        let account = await ledger.getLedger(ownerAddress);
        expect(account.totalBalance).to.equal(BigInt(ownerInitialLedgerBalance));
        expect(account.availableBalance).to.equal(BigInt(ownerInitialLedgerBalance - ownerInitialFineTuningBalance));
        expect(account.fineTuningProviders[0]).equal(provider1Address);

        await expect(ledger.refund(ownerInitialLedgerBalance)).to.be.reverted;
        await expect(ledger.refund(ownerInitialLedgerBalance - ownerInitialFineTuningBalance)).not.to.be.reverted;

        account = await ledger.getLedger(ownerAddress);
        expect(account.availableBalance).to.equal(BigInt(0));
    });

    describe("Retrieve Fund from fine-tuning sub-account", () => {
        let unlockTime: number;

        beforeEach(async () => {
            await Promise.all([ledger.transferFund(provider1Address, "fine-tuning", ownerInitialFineTuningBalance)]);

            const res = await ledger.retrieveFund([provider1Address], "fine-tuning");
            const receipt = await res.wait();

            const block = await ethers.provider.getBlock((receipt as TransactionReceipt).blockNumber);
            unlockTime = (block as Block).timestamp + lockTime;
        });

        it("should not receive fund if the unlockTime hasn't arrived and called ", async () => {
            await time.increaseTo(unlockTime - 1);

            await ledger.retrieveFund([provider1Address], "fine-tuning");
            const fineTuningAccount = await fineTuningServing.getAccount(ownerAddress, provider1);
            const ledgerAccount = await ledger.getLedger(ownerAddress);

            expect(fineTuningAccount.balance).to.be.equal(BigInt(ownerInitialFineTuningBalance));
            expect(ledgerAccount.availableBalance).to.be.equal(
                BigInt(ownerInitialLedgerBalance - ownerInitialFineTuningBalance)
            );
        });

        it("should receive fund if the unlockTime has arrived and called", async () => {
            await time.increaseTo(unlockTime + 1);

            await ledger.retrieveFund([provider1Address], "fine-tuning");
            const fineTuningAccount = await fineTuningServing.getAccount(ownerAddress, provider1);
            const ledgerAccount = await ledger.getLedger(ownerAddress);

            expect(fineTuningAccount.balance).to.be.equal(BigInt(0));
            expect(ledgerAccount.availableBalance).to.be.equal(BigInt(ownerInitialLedgerBalance));
        });
    });

    describe("Retrieve Fund from inference sub-account", () => {
        let unlockTime: number;

        beforeEach(async () => {
            await Promise.all([ledger.transferFund(provider1Address, "inference", ownerInitialInferenceBalance)]);

            const res = await ledger.retrieveFund([provider1Address], "inference");
            const receipt = await res.wait();

            const block = await ethers.provider.getBlock((receipt as TransactionReceipt).blockNumber);
            unlockTime = (block as Block).timestamp + lockTime;
        });

        it("should not receive fund if the unlockTime hasn't arrived and called ", async () => {
            await time.increaseTo(unlockTime - 1);

            await ledger.retrieveFund([provider1Address], "inference");
            const inferenceAccount = await inferenceServing.getAccount(ownerAddress, provider1);
            const ledgerAccount = await ledger.getLedger(ownerAddress);

            expect(inferenceAccount.balance).to.be.equal(BigInt(ownerInitialInferenceBalance));
            expect(ledgerAccount.availableBalance).to.be.equal(
                BigInt(ownerInitialLedgerBalance - ownerInitialInferenceBalance)
            );
        });

        it("should receive fund if the unlockTime has arrived and called", async () => {
            await time.increaseTo(unlockTime + 1);

            await ledger.retrieveFund([provider1Address], "inference");
            const inferenceAccount = await inferenceServing.getAccount(ownerAddress, provider1);
            const ledgerAccount = await ledger.getLedger(ownerAddress);

            expect(inferenceAccount.balance).to.be.equal(BigInt(0));
            expect(ledgerAccount.availableBalance).to.be.equal(BigInt(ownerInitialLedgerBalance));
        });
    });

    it("should delete account", async () => {
        await Promise.all([
            ledger.transferFund(provider1Address, "fine-tuning", ownerInitialFineTuningBalance),
            ledger.connect(user1).transferFund(provider1Address, "fine-tuning", user1InitialFineTuningBalance),
        ]);

        let [accounts] = await fineTuningServing.getAllAccounts(0, 0);
        expect(accounts.length).to.equal(2);

        await expect(ledger.deleteLedger()).not.to.be.reverted;
        [accounts] = await fineTuningServing.getAllAccounts(0, 0);
        expect(accounts.length).to.equal(1);
    });
});
