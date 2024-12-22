// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "../utils/Initializable.sol";
import "./Account.sol";
import "./Service.sol";
import "./Verifier.sol";

interface IVerifier {
    function verifySignature(
        string memory message,
        bytes memory signature,
        address expectedAddress
    ) external view returns (bool);
}

contract Serving is Ownable, Initializable {
    using AccountLibrary for AccountLibrary.AccountMap;
    using ServiceLibrary for ServiceLibrary.ServiceMap;
    using VerifierLibrary for VerifierInput;

    uint public lockTime;
    AccountLibrary.AccountMap private accountMap;
    ServiceLibrary.ServiceMap private serviceMap;

    event BalanceUpdated(address indexed user, address indexed provider, uint amount, uint pendingRefund);
    event RefundRequested(address indexed user, address indexed provider, uint indexed index, uint timestamp);
    event ServiceUpdated(address indexed service, string indexed name, string url, Quota quota, bool occupied);
    event ServiceRemoved(address indexed service, string indexed name);

    error InvalidProofInputs(string reason);

    function initialize(uint _locktime, address owner) public onlyInitializeOnce {
        _transferOwnership(owner);
        lockTime = _locktime;
    }

    function updateLockTime(uint _locktime) public onlyOwner {
        lockTime = _locktime;
    }

    function getAccount(address user, address provider) public view returns (Account memory) {
        return accountMap.getAccount(user, provider);
    }

    function getAllAccounts() public view returns (Account[] memory) {
        return accountMap.getAllAccounts();
    }

    function addAccount(address provider, uint[2] calldata signer, string memory additionalInfo) external payable {
        (uint balance, uint pendingRefund) = accountMap.addAccount(
            msg.sender,
            provider,
            signer,
            msg.value,
            additionalInfo
        );
        emit BalanceUpdated(msg.sender, provider, balance, pendingRefund);
    }

    function deleteAccount(address provider) external {
        accountMap.deleteAccount(msg.sender, provider);
    }

    function depositFund(address provider) external payable {
        (uint balance, uint pendingRefund) = accountMap.depositFund(msg.sender, provider, msg.value);
        emit BalanceUpdated(msg.sender, provider, balance, pendingRefund);
    }

    function requestRefund(address provider, uint amount) external {
        uint index = accountMap.requestRefund(msg.sender, provider, amount);
        emit RefundRequested(msg.sender, provider, index, block.timestamp);
    }

    function processRefund(address provider, uint[] calldata indices) external {
        (uint totalAmount, uint balance, uint pendingRefund) = accountMap.processRefund(
            msg.sender,
            provider,
            indices,
            lockTime
        );

        payable(msg.sender).transfer(totalAmount);
        emit BalanceUpdated(msg.sender, provider, balance, pendingRefund);
    }

    function updateProviderSigningAddress(address provider, address providerSigningAddress) external payable {
        accountMap.updateProviderSigningAddress(msg.sender, provider, providerSigningAddress);
    }

    function getService(address provider, string memory name) public view returns (Service memory service) {
        service = serviceMap.getService(provider, name);
    }

    function getAllServices() public view returns (Service[] memory services) {
        services = serviceMap.getAllServices();
    }

    function addOrUpdateService(string memory name, string calldata url, Quota memory quota, bool occupied) external {
        serviceMap.addOrUpdateService(msg.sender, name, url, quota, occupied);
        emit ServiceUpdated(msg.sender, name, url, quota, occupied);
    }

    function removeService(string memory name) external {
        serviceMap.removeService(msg.sender, name);
        emit ServiceRemoved(msg.sender, name);
    }

    function settleFees(VerifierInput calldata verifierInput) external {
        Account storage account = accountMap.getAccount(verifierInput.user, msg.sender);

        if (account.providerSigningAddress == address(0)) {
            revert InvalidProofInputs("providerSigningAddress not set");
        }

        bool teePassed = verifierInput.verifySignature(account.providerSigningAddress);
        if (!teePassed) {
            revert InvalidProofInputs("TEE settlement validation failed");
        }

        Deliverable memory deliverable = Deliverable({
            jobID: verifierInput.jobID,
            modelRootHash: verifierInput.modelRootHash
        });

        accountMap.updateDeliverables(verifierInput.user, msg.sender, deliverable);

        _settleFees(account, verifierInput.taskFee);
        account.nonce = verifierInput.nonce;
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
        emit BalanceUpdated(account.user, msg.sender, account.balance, account.pendingRefund);
        payable(msg.sender).transfer(amount);
    }
}
