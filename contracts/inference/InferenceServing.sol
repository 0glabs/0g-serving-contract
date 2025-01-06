// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "../utils/Initializable.sol";
import "./InferenceAccount.sol";
import "./InferenceService.sol";
import "../ledger/LedgerManager.sol";

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

contract InferenceServing is Ownable, Initializable, IServing {
    using AccountLibrary for AccountLibrary.AccountMap;
    using ServiceLibrary for ServiceLibrary.ServiceMap;

    uint public lockTime;
    address public batchVerifierAddress;
    address public ledgerAddress;
    IBatchVerifier private batchVerifier;
    ILedger private ledger;
    AccountLibrary.AccountMap private accountMap;
    ServiceLibrary.ServiceMap private serviceMap;

    event BalanceUpdated(address indexed user, address indexed provider, uint amount, uint pendingRefund);
    event RefundRequested(address indexed user, address indexed provider, uint indexed index, uint timestamp);
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

    function initialize(
        uint _locktime,
        address _batchVerifierAddress,
        address _ledgerAddress,
        address owner
    ) public onlyInitializeOnce {
        _transferOwnership(owner);
        lockTime = _locktime;
        batchVerifierAddress = _batchVerifierAddress;
        ledgerAddress = _ledgerAddress;
        ledger = ILedger(ledgerAddress);
        batchVerifier = IBatchVerifier(batchVerifierAddress);
    }

    modifier onlyLedger() {
        require(msg.sender == ledgerAddress, "Caller is not the ledger contract");
        _;
    }

    function updateLockTime(uint _locktime) public onlyOwner {
        lockTime = _locktime;
    }

    function updateBatchVerifierAddress(address _batchVerifierAddress) public onlyOwner {
        batchVerifierAddress = _batchVerifierAddress;
        batchVerifier = IBatchVerifier(batchVerifierAddress);
    }

    function getAccount(address user, address provider) public view returns (Account memory) {
        return accountMap.getAccount(user, provider);
    }

    function getAllAccounts() public view returns (Account[] memory) {
        return accountMap.getAllAccounts();
    }

    function accountExists(address user, address provider) public view returns (bool) {
        return accountMap.accountExists(user, provider);
    }

    function addAccount(
        address user,
        address provider,
        uint[2] calldata signer,
        string memory additionalInfo
    ) external payable onlyLedger {
        (uint balance, uint pendingRefund) = accountMap.addAccount(user, provider, signer, msg.value, additionalInfo);
        emit BalanceUpdated(user, provider, balance, pendingRefund);
    }

    function deleteAccount(address user, address provider) external onlyLedger {
        accountMap.deleteAccount(user, provider);
    }

    function depositFund(address user, address provider) external payable onlyLedger {
        (uint balance, uint pendingRefund) = accountMap.depositFund(user, provider, msg.value);
        emit BalanceUpdated(user, provider, balance, pendingRefund);
    }

    function requestRefundAll(address user, address provider) external onlyLedger {
        accountMap.requestRefundAll(user, provider);
    }

    function processRefund(
        address user,
        address provider
    ) external onlyLedger returns (uint totalAmount, uint balance, uint pendingRefund) {
        (totalAmount, balance, pendingRefund) = accountMap.processRefund(user, provider, lockTime);
        if (totalAmount == 0) {
            return (0, balance, pendingRefund);
        }
        payable(msg.sender).transfer(totalAmount);
        emit BalanceUpdated(user, provider, balance, pendingRefund);
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
            Account storage account = accountMap.getAccount(address(uint160(expectedUserAddress)), msg.sender);
            if (account.signer[0] != inputs[start + 5] || account.signer[1] != inputs[start + 6]) {
                revert InvalidProofInputs("signer key is incorrect");
            }
            if (account.nonce > firstRequestNonce) {
                revert InvalidProofInputs("initial nonce is incorrect");
            }
            for (uint chunkIdx = start; chunkIdx < end; chunkIdx += 7) {
                uint userAddress = inputs[chunkIdx];
                uint providerAddress = inputs[chunkIdx + 1];
                lastRequestNonce = inputs[chunkIdx + 3];
                uint cost = inputs[chunkIdx + 4];
                uint nextChunkFirstRequestNonce = chunkIdx + 9 < end ? inputs[chunkIdx + 9] : 0;

                if (nextChunkFirstRequestNonce != 0 && lastRequestNonce >= nextChunkFirstRequestNonce) {
                    revert InvalidProofInputs("nonce overlapped");
                }

                if (userAddress != expectedUserAddress || providerAddress != expectedProviderAddress) {
                    revert InvalidProofInputs(
                        userAddress != expectedUserAddress
                            ? "user address is incorrect"
                            : "provider address is incorrect"
                    );
                }

                totalCosts += cost;
            }
            if (account.balance < totalCosts) {
                revert InvalidProofInputs("insufficient balance");
            }
            _settleFees(account, totalCosts);
            start = end;
            account.nonce = lastRequestNonce;
        }
        if (start != inputs.length) {
            revert InvalidProofInputs("array segmentSize sum mismatches public input length");
        }
    }

    function _settleFees(Account storage account, uint amount) private {
        if (amount > (account.balance - account.pendingRefund)) {
            uint remainingFee = amount - (account.balance - account.pendingRefund);
            if (account.pendingRefund < remainingFee) {
                revert InvalidProofInputs("insufficient balance in pendingRefund");
            }

            account.pendingRefund -= remainingFee;
            for (int i = int(account.refunds.length - 1); i >= 0; i--) {
                Refund storage refund = account.refunds[uint(i)];
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
        account.balance -= amount;
        ledger.spendFund(account.user, amount);
        emit BalanceUpdated(account.user, msg.sender, account.balance, account.pendingRefund);
        payable(msg.sender).transfer(amount);
    }
}
