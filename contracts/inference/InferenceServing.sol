// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "../utils/Initializable.sol";
import "./InferenceAccount.sol";
import "./InferenceService.sol";
import "../ledger/LedgerManager.sol";


struct TEESettlementData {
    address user;
    address provider;
    uint totalFee;
    bytes32 requestsHash;
    uint nonce;
    bytes signature;
}


contract InferenceServing is Ownable, Initializable, IServing {
    using AccountLibrary for AccountLibrary.AccountMap;
    using ServiceLibrary for ServiceLibrary.ServiceMap;

    uint public lockTime;
    address public ledgerAddress;
    ILedger private ledger;
    AccountLibrary.AccountMap private accountMap;
    ServiceLibrary.ServiceMap private serviceMap;

    event BalanceUpdated(address indexed user, address indexed provider, uint amount, uint pendingRefund);
    event RefundRequested(address indexed user, address indexed provider, uint indexed index, uint timestamp);
    event ServiceUpdated(
        address indexed service,
        string serviceType,
        string url,
        uint inputPrice,
        uint outputPrice,
        uint updatedAt,
        string model,
        string verifiability
    );
    event ServiceRemoved(address indexed service);
    event TEESettlementCompleted(address indexed provider, uint successCount, uint failedCount);
    event TEESettlementFailed(address indexed provider, address indexed user, string reason);

    error InvalidProofInputs(string reason);
    error InvalidTEESignature(string reason);

    function initialize(
        uint _locktime,
        address _ledgerAddress,
        address owner
    ) public onlyInitializeOnce {
        _transferOwnership(owner);
        lockTime = _locktime;
        ledgerAddress = _ledgerAddress;
        ledger = ILedger(ledgerAddress);
    }

    modifier onlyLedger() {
        require(msg.sender == ledgerAddress, "Caller is not the ledger contract");
        _;
    }

    function updateLockTime(uint _locktime) public onlyOwner {
        lockTime = _locktime;
    }

    function getAccount(address user, address provider) public view returns (Account memory) {
        return accountMap.getAccount(user, provider);
    }

    function getAllAccounts(
        uint offset,
        uint limit
    ) public view returns (Account[] memory accounts, uint total) {
        require(limit == 0 || limit <= 50, "Limit too large");
        return accountMap.getAllAccounts(offset, limit);
    }

    function getAccountsByProvider(
        address provider,
        uint offset,
        uint limit
    ) public view returns (Account[] memory accounts, uint total) {
        require(limit == 0 || limit <= 50, "Limit too large");
        return accountMap.getAccountsByProvider(provider, offset, limit);
    }

    function getAccountsByUser(
        address user,
        uint offset,
        uint limit
    ) public view returns (Account[] memory accounts, uint total) {
        require(limit == 0 || limit <= 50, "Limit too large");
        return accountMap.getAccountsByUser(user, offset, limit);
    }

    function getBatchAccountsByUsers(address[] calldata users) external view returns (Account[] memory accounts) {
        return accountMap.getBatchAccountsByUsers(users, msg.sender);
    }

    function acknowledgeProviderSigner(address provider, uint[2] calldata providerPubKey) external {
        accountMap.acknowledgeProviderSigner(msg.sender, provider, providerPubKey);
    }

    function acknowledgeTEESigner(address provider, address teeSignerAddress) external {
        accountMap.acknowledgeTEESigner(msg.sender, provider, teeSignerAddress);
    }

    function accountExists(address user, address provider) public view returns (bool) {
        return accountMap.accountExists(user, provider);
    }

    function getPendingRefund(address user, address provider) public view returns (uint) {
        return accountMap.getPendingRefund(user, provider);
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

    function depositFund(address user, address provider, uint cancelRetrievingAmount) external payable onlyLedger {
        (uint balance, uint pendingRefund) = accountMap.depositFund(user, provider, cancelRetrievingAmount, msg.value);
        emit BalanceUpdated(user, provider, balance, pendingRefund);
    }

    function requestRefundAll(address user, address provider) external onlyLedger {
        accountMap.requestRefundAll(user, provider);
        Account memory account = accountMap.getAccount(user, provider);
        if (account.refunds.length > 0) {
            emit RefundRequested(user, provider, account.refunds.length - 1, block.timestamp);
        }
    }

    function processRefund(
        address user,
        address provider
    ) external onlyLedger returns (uint totalAmount, uint balance, uint pendingRefund) {
        (totalAmount, balance, pendingRefund) = accountMap.processRefund(user, provider, lockTime);

        if (totalAmount > 0) {
            payable(msg.sender).transfer(totalAmount);
            emit BalanceUpdated(user, provider, balance, pendingRefund);
        }
    }

    function getService(address provider) public view returns (Service memory service) {
        service = serviceMap.getService(provider);
    }

    function getAllServices() public view returns (Service[] memory services) {
        services = serviceMap.getAllServices();
    }

    function addOrUpdateService(ServiceParams calldata params) external {
        serviceMap.addOrUpdateService(msg.sender, params);
        emit ServiceUpdated(
            msg.sender,
            params.serviceType,
            params.url,
            params.inputPrice,
            params.outputPrice,
            block.timestamp,
            params.model,
            params.verifiability
        );
    }

    function removeService() external {
        serviceMap.removeService(msg.sender);
        emit ServiceRemoved(msg.sender);
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

    function settleFeesWithTEE(
        TEESettlementData[] calldata settlements
    ) external returns (address[] memory failedUsers) {
        require(settlements.length > 0, "No settlements provided");

        address[] memory tempFailedUsers = new address[](settlements.length);
        uint failedCount = 0;
        uint successCount = 0;

        for (uint i = 0; i < settlements.length; i++) {
            TEESettlementData memory settlement = settlements[i];

            // Process settlement inline to better handle errors
            (bool success, string memory failureReason) = _processTEESettlementInternal(settlement, msg.sender);

            if (success) {
                successCount++;
            } else {
                tempFailedUsers[failedCount] = settlement.user;
                failedCount++;
                emit TEESettlementFailed(msg.sender, settlement.user, failureReason);
            }
        }

        // Create array with exact size for failed users
        failedUsers = new address[](failedCount);
        for (uint i = 0; i < failedCount; i++) {
            failedUsers[i] = tempFailedUsers[i];
        }

        // Emit completion event
        emit TEESettlementCompleted(msg.sender, successCount, failedCount);
    }

    function _processTEESettlementInternal(
        TEESettlementData memory settlement,
        address provider
    ) private returns (bool success, string memory failureReason) {
        // Verify provider matches
        if (settlement.provider != provider) {
            return (false, "Provider mismatch");
        }

        // Get account to verify provider's TEE signer
        Account storage account = accountMap.getAccount(settlement.user, provider);

        // Verify that the account has acknowledged a TEE signer
        if (account.teeSignerAddress == address(0)) {
            return (false, "TEE signer not acknowledged");
        }

        // Verify TEE signature
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                settlement.requestsHash,
                settlement.nonce,
                settlement.provider,
                settlement.user,
                settlement.totalFee
            )
        );

        // Add Ethereum Signed Message prefix to match what ethers.js signMessage expects
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));

        // Recover signer address from signature
        address recoveredSigner = recoverSigner(ethSignedMessageHash, settlement.signature);

        // Verify the signature is from the acknowledged TEE signer
        if (recoveredSigner != account.teeSignerAddress) {
            return (false, "Invalid TEE signer");
        }

        // Check that nonce is greater than the recorded nonce
        if (account.nonce >= settlement.nonce) {
            return (false, "Nonce already processed");
        }

        // Check balance sufficiency
        if (account.balance < settlement.totalFee) {
            return (false, "Insufficient balance");
        }

        // Update account nonce
        account.nonce = settlement.nonce;

        // Settle the fees
        _settleFees(account, settlement.totalFee);

        return (true, "");
    }

    function recoverSigner(bytes32 ethSignedMessageHash, bytes memory signature) internal pure returns (address) {
        require(signature.length == 65, "Invalid signature length");

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            // Extract r, s, v from signature
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }

        // Handle both possible v values (27/28 or 0/1)
        if (v < 27) {
            v += 27;
        }

        return ecrecover(ethSignedMessageHash, v, r, s);
    }
}
