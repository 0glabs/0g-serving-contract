// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "../utils/Initializable.sol";
import "./FineTuningAccount.sol";
import "./FineTuningService.sol";
import "./FineTuningVerifier.sol";
import "../ledger/LedgerManager.sol";

interface ISignatureVerifier {
    function verifySignature(
        string memory message,
        bytes memory signature,
        address expectedAddress
    ) external view returns (bool);
}

contract FineTuningServing is Ownable, Initializable, IServing {
    using AccountLibrary for AccountLibrary.AccountMap;
    using ServiceLibrary for ServiceLibrary.ServiceMap;
    using VerifierLibrary for VerifierInput;

    uint public lockTime;
    address public ledgerAddress;
    ILedger private ledger;
    AccountLibrary.AccountMap private accountMap;
    ServiceLibrary.ServiceMap private serviceMap;
    uint public penaltyPercentage;

    event BalanceUpdated(address indexed user, address indexed provider, uint amount, uint pendingRefund);
    event RefundRequested(address indexed user, address indexed provider, uint indexed index, uint timestamp);
    event ServiceUpdated(
        address indexed user,
        string url,
        Quota quota,
        uint pricePerToken,
        address providerSigner,
        bool occupied
    );
    event ServiceRemoved(address indexed user);
    error InvalidVerifierInput(string reason);

    function initialize(
        uint _locktime,
        address _ledgerAddress,
        address owner,
        uint _penaltyPercentage
    ) public onlyInitializeOnce {
        _transferOwnership(owner);
        lockTime = _locktime;
        ledgerAddress = _ledgerAddress;
        ledger = ILedger(ledgerAddress);
        penaltyPercentage = _penaltyPercentage;
    }

    modifier onlyLedger() {
        require(msg.sender == ledgerAddress, "Caller is not the ledger contract");
        _;
    }

    function updateLockTime(uint _locktime) public onlyOwner {
        lockTime = _locktime;
    }

    function updatePenaltyPercentage(uint _penaltyPercentage) public onlyOwner {
        penaltyPercentage = _penaltyPercentage;
    }

    // user functions

    function getAccount(address user, address provider) public view returns (Account memory) {
        return accountMap.getAccount(user, provider);
    }

    function getAllAccounts() public view returns (Account[] memory) {
        return accountMap.getAllAccounts();
    }

    function accountExists(address user, address provider) public view returns (bool) {
        return accountMap.accountExists(user, provider);
    }

    function getPendingRefund(address user, address provider) public view returns (uint) {
        return accountMap.getPendingRefund(user, provider);
    }

    function addAccount(address user, address provider, string memory additionalInfo) external payable onlyLedger {
        (uint balance, uint pendingRefund) = accountMap.addAccount(user, provider, msg.value, additionalInfo);
        emit BalanceUpdated(user, provider, balance, pendingRefund);
    }

    function deleteAccount(address user, address provider) external onlyLedger {
        accountMap.deleteAccount(user, provider);
    }

    function depositFund(address user, address provider, uint cancelRetrievingAmount) external payable onlyLedger {
        (uint balance, uint pendingRefund) = accountMap.depositFund(user, provider, cancelRetrievingAmount, msg.value);
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

    function getService(address provider) public view returns (Service memory service) {
        service = serviceMap.getService(provider);
    }

    function getAllServices() public view returns (Service[] memory services) {
        services = serviceMap.getAllServices();
    }

    function acknowledgeProviderSigner(address provider, address providerSigner) external {
        accountMap.acknowledgeProviderSigner(msg.sender, provider, providerSigner);
    }

    function acknowledgeDeliverable(address provider, uint index) external {
        accountMap.acknowledgeDeliverable(msg.sender, provider, index);
    }

    // provider functions

    function addOrUpdateService(
        string calldata url,
        Quota memory quota,
        uint pricePerToken,
        address providerSigner,
        bool occupied,
        string[] memory models
    ) external {
        serviceMap.addOrUpdateService(msg.sender, url, quota, pricePerToken, providerSigner, occupied, models);
        emit ServiceUpdated(msg.sender, url, quota, pricePerToken, providerSigner, occupied);
    }

    function removeService() external {
        serviceMap.removeService(msg.sender);
        emit ServiceRemoved(msg.sender);
    }

    function addDeliverable(address user, bytes memory modelRootHash) external {
        accountMap.addDeliverable(user, msg.sender, modelRootHash);
    }

    function getDeliverable(address user, address provider, uint index) public view returns (Deliverable memory) {
        return accountMap.getAccount(user, provider).deliverables[index];
    }

    function settleFees(VerifierInput calldata verifierInput) external {
        Account storage account = accountMap.getAccount(verifierInput.user, msg.sender);
        if (account.providerSigner != verifierInput.providerSigner) {
            revert InvalidVerifierInput("provider signing address is not acknowledged");
        }
        if (account.nonce >= verifierInput.nonce) {
            revert InvalidVerifierInput("nonce should larger than the current nonce");
        }
        if (account.balance < verifierInput.taskFee) {
            revert InvalidVerifierInput("insufficient balance");
        }
        Deliverable storage deliverable = account.deliverables[verifierInput.index];
        if (keccak256(deliverable.modelRootHash) != keccak256(verifierInput.modelRootHash)) {
            revert InvalidVerifierInput("model root hash mismatch");
        }
        bool teePassed = verifierInput.verifySignature(account.providerSigner);
        if (!teePassed) {
            revert InvalidVerifierInput("TEE settlement validation failed");
        }

        uint fee = verifierInput.taskFee;
        if (deliverable.acknowledged) {
            require(verifierInput.encryptedSecret.length != 0, "secret should not be empty");
            account.deliverables[verifierInput.index].encryptedSecret = verifierInput.encryptedSecret;
        } else {
            require(verifierInput.encryptedSecret.length == 0, "secret should be empty");
            fee = (fee * penaltyPercentage) / 100;
        }

        account.nonce = verifierInput.nonce;
        _settleFees(account, fee);
    }

    function _settleFees(Account storage account, uint amount) private {
        if (amount > (account.balance - account.pendingRefund)) {
            uint remainingFee = amount - (account.balance - account.pendingRefund);
            if (account.pendingRefund < remainingFee) {
                revert InvalidVerifierInput("insufficient balance in pendingRefund");
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
