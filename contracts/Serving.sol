// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "./utils/Initializable.sol";
import "./BaseLedger.sol";
import "./FineTuningLedger.sol";
import "./InferenceLedger.sol";
import "./Service.sol";

struct VerifierInput {
    uint[] inProof;
    uint[] proofInputs;
    uint numChunks;
    uint[] segmentSize;
}

interface IBatchVerifier {
    function verifyBatch(
        uint[] calldata inProof,
        uint[] calldata proofInputs,
        uint numProofs
    ) external view returns (bool);
}

contract Serving is Ownable, Initializable {
    using BaseLedgerLibrary for BaseLedgerMap;
    using InferenceLedgerLibrary for InferenceLedgerMap;
    using FineTuningLedgerLibrary for FineTuningLedgerMap;
    using ServiceLibrary for ServiceLibrary.ServiceMap;

    uint public lockTime;
    address public batchVerifierAddress;
    IBatchVerifier private batchVerifier;
    BaseLedgerMap private baseLedgerMap;
    InferenceLedgerMap private inferenceLedgerMap;
    FineTuningLedgerMap private fineTuningLedgerMap;
    ServiceLibrary.ServiceMap private serviceMap;

    event BalanceUpdated(
        string serviceType,
        address indexed customer,
        address indexed provider,
        uint amount,
        uint pendingRefund
    );
    event RefundRequested(address indexed customer, address indexed provider, uint indexed index, uint timestamp);
    event ServiceUpdated(
        address indexed service,
        string indexed name,
        string serviceType,
        string url,
        uint inputPrice,
        uint outputPrice,
        uint updatedAt,
        string model,
        string verifiability
    );
    event ServiceRemoved(address indexed service, string indexed name);

    error InvalidProofInputs(string reason);

    function initialize(uint _locktime, address _batchVerifierAddress, address owner) public onlyInitializeOnce {
        _transferOwnership(owner);
        lockTime = _locktime;
        batchVerifierAddress = _batchVerifierAddress;
        batchVerifier = IBatchVerifier(batchVerifierAddress);
    }

    function updateLockTime(uint _locktime) public onlyOwner {
        lockTime = _locktime;
    }

    function updateBatchVerifierAddress(address _batchVerifierAddress) public onlyOwner {
        batchVerifierAddress = _batchVerifierAddress;
        batchVerifier = IBatchVerifier(batchVerifierAddress);
    }

    function getInferenceLedger(address customer, address provider) public view returns (InferenceLedger memory) {
        return inferenceLedgerMap.getLedger(customer, provider);
    }

    function getFineTuningLedger(address customer, address provider) public view returns (FineTuningLedger memory) {
        return fineTuningLedgerMap.getLedger(customer, provider);
    }

    function getAllInferenceLedgers() public view returns (InferenceLedger[] memory) {
        return inferenceLedgerMap.getAllLedgers();
    }

    function getAllFineTuningLedgers() public view returns (FineTuningLedger[] memory) {
        return fineTuningLedgerMap.getAllLedgers();
    }

    function addInferenceLedger(
        address provider,
        uint[2] calldata signer,
        string memory additionalInfo
    ) external payable {
        (uint balance, uint pendingRefund) = inferenceLedgerMap.addLedger(
            msg.sender,
            provider,
            signer,
            msg.value,
            additionalInfo
        );
    }

    function addFineTuningLedger(
        address provider,
        uint[2] calldata signer,
        string memory additionalInfo
    ) external payable {
        (uint balance, uint pendingRefund) = fineTuningLedgerMap.addLedger(msg.sender, provider, msg.value);
    }

    function deleteInferenceLedger(address provider) external {
        inferenceLedgerMap.deleteLedger(msg.sender, provider);
    }

    function deleteFineTuningLedger(address provider) external {
        fineTuningLedgerMap.deleteLedger(msg.sender, provider);
    }

    function depositFund(address provider) external payable {
        (uint balance, uint pendingRefund) = baseLedgerMap.depositFund(msg.sender, provider, msg.value);
    }

    function requestRefund(address provider, uint amount) external {
        uint index = baseLedgerMap.requestRefund(msg.sender, provider, amount);
        emit RefundRequested(msg.sender, provider, index, block.timestamp);
    }

    function processRefund(address provider, uint[] calldata indices) external {
        (uint totalAmount, uint balance, uint pendingRefund) = ledgerMap.processRefund(
            msg.sender,
            provider,
            indices,
            lockTime
        );

        payable(msg.sender).transfer(totalAmount);
        emit BalanceUpdated(msg.sender, provider, balance, pendingRefund);
    }

    function getService(address provider, string memory name) public view returns (Service memory service) {
        service = serviceMap.getService(provider, name);
    }

    function getAllServices() public view returns (Service[] memory services) {
        services = serviceMap.getAllServices();
    }

    function addOrUpdateService(
        string memory name,
        string memory serviceType,
        string calldata url,
        string calldata model,
        string calldata verifiability,
        uint inputPrice,
        uint outputPrice
    ) external {
        serviceMap.addOrUpdateService(
            msg.sender,
            name,
            serviceType,
            url,
            model,
            verifiability,
            inputPrice,
            outputPrice
        );
        emit ServiceUpdated(
            msg.sender,
            name,
            serviceType,
            url,
            inputPrice,
            outputPrice,
            block.timestamp,
            model,
            verifiability
        );
    }

    function removeService(string memory name) external {
        serviceMap.removeService(msg.sender, name);
        emit ServiceRemoved(msg.sender, name);
    }

    function settleFees(VerifierInput calldata verifierInput) external {
        bool zkPassed = batchVerifier.verifyBatch(
            verifierInput.inProof,
            verifierInput.proofInputs,
            verifierInput.numChunks
        );
        if (!zkPassed) {
            revert InvalidProofInputs("ZK settlement validation failed");
        }

        uint[] memory inputs = verifierInput.proofInputs;
        uint start = 0;
        uint expectedProviderAddress = uint(uint160(msg.sender));

        for (uint segmentIdx = 0; segmentIdx < verifierInput.segmentSize.length; segmentIdx++) {
            uint segmentSize = verifierInput.segmentSize[segmentIdx];
            uint end = start + segmentSize;

            uint totalCosts = 0;
            uint expectedUserAddress = inputs[start];
            uint firstRequestNonce = inputs[start + 2];
            uint lastRequestNonce = inputs[start + 3];
            Ledger storage ledger = ledgerMap.getLedger(address(uint160(expectedUserAddress)), msg.sender);
            if (ledger.customerSigner[0] != inputs[start + 5] || ledger.customerSigner[1] != inputs[start + 6]) {
                revert InvalidProofInputs("customer signer key is incorrect");
            }
            if (ledger.nonce > firstRequestNonce) {
                revert InvalidProofInputs("initial nonce is incorrect");
            }
            for (uint chunkIdx = start; chunkIdx < end; chunkIdx += 7) {
                uint customerAddress = inputs[chunkIdx];
                uint providerAddress = inputs[chunkIdx + 1];
                lastRequestNonce = inputs[chunkIdx + 3];
                uint cost = inputs[chunkIdx + 4];
                uint nextChunkFirstRequestNonce = chunkIdx + 9 < end ? inputs[chunkIdx + 9] : 0;

                if (nextChunkFirstRequestNonce != 0 && lastRequestNonce >= nextChunkFirstRequestNonce) {
                    revert InvalidProofInputs("nonce overlapped");
                }

                if (customerAddress != expectedUserAddress || providerAddress != expectedProviderAddress) {
                    revert InvalidProofInputs(
                        customerAddress != expectedUserAddress
                            ? "customer address is incorrect"
                            : "provider address is incorrect"
                    );
                }

                totalCosts += cost;
            }
            if (ledger.balance < totalCosts) {
                revert InvalidProofInputs("insufficient balance");
            }
            _settleFees(ledger, totalCosts);
            start = end;
            ledger.nonce = lastRequestNonce;
        }
        if (start != inputs.length) {
            revert InvalidProofInputs("array segmentSize sum mismatches public input length");
        }
    }

    function _settleFees(Ledger storage ledger, uint amount) private {
        if (amount > (ledger.balance - ledger.pendingRefund)) {
            uint remainingFee = amount - (ledger.balance - ledger.pendingRefund);
            if (ledger.pendingRefund < remainingFee) {
                revert InvalidProofInputs("insufficient balance in pendingRefund");
            }

            ledger.pendingRefund -= remainingFee;
            for (int i = int(ledger.refunds.length - 1); i >= 0; i--) {
                Refund storage refund = ledger.refunds[uint(i)];
                if (refund.processed) {
                    continue;
                }

                if (refund.amount <= remainingFee) {
                    remainingFee -= refund.amount;
                } else {
                    refund.amount -= remainingFee;
                    remainingFee = 0;
                }

                if (remainingFee == 0) {
                    break;
                }
            }
        }
        ledger.balance -= amount;
        emit BalanceUpdated(ledger.customer, msg.sender, ledger.balance, ledger.pendingRefund);
        payable(msg.sender).transfer(amount);
    }
}
