// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "../utils/Initializable.sol";
import "../Account.sol";
import "../Service.sol";
import "../Request.sol";

contract ServingV2 is Ownable, Initializable {
    using AccountLibrary for AccountLibrary.AccountMap;
    using ServiceLibrary for ServiceLibrary.ServiceMap;
    using RequestLibrary for Request;

    uint public lockTime;
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
        uint updatedAt
    );
    event ServiceRemoved(address indexed service, string indexed name);

    error EmptyRequestTrace();
    error NonceUsed(uint index, uint minimum, uint given);
    error InvalidRequest(uint index);
    error ServiceUpdatedBeforeSettle(uint index, uint serviceUpdatedAt, uint requestCreatedAt);
    error InsufficientBalanceWhenSettle(uint amount, uint balance);
    error InsufficientBalanceInPendingRefund(uint remainingFee, uint pendingRefund);

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
        uint inputPrice,
        uint outputPrice
    ) external {
        serviceMap.addOrUpdateService(msg.sender, name, serviceType, url, inputPrice, outputPrice);
        emit ServiceUpdated(msg.sender, name, serviceType, url, inputPrice, outputPrice, block.timestamp);
    }

    function removeService(string memory name) external {
        serviceMap.removeService(msg.sender, name);
        emit ServiceRemoved(msg.sender, name);
    }

    function settleFees(RequestTrace[] memory traces) external {
        for (uint i = 0; i < traces.length; i++) {
            RequestTrace memory trace = traces[i];
            _settleFees(trace.requests);
        }
    }

    function _settleFees(Request[] memory requests) internal {
        if (requests.length == 0) {
            revert EmptyRequestTrace();
        }
        uint amount = 0;
        Account storage account = accountMap.getAccount(requests[0].userAddress, msg.sender);
        for (uint i = 0; i < requests.length; i++) {
            Request memory request = requests[i];
            if (request.nonce <= account.nonce) {
                revert NonceUsed(i, account.nonce + 1, request.nonce);
            }
            account.nonce = request.nonce;
            if (!request.verify(msg.sender)) {
                revert InvalidRequest(i);
            }
            Service storage service = serviceMap.getService(msg.sender, request.serviceName);
            if (service.updatedAt >= request.createdAt) {
                revert ServiceUpdatedBeforeSettle(i, service.updatedAt, request.createdAt);
            }
            amount += request.inputCount * service.inputPrice;
            amount += request.previousOutputCount * service.outputPrice;
        }
        if (account.balance < amount) {
            revert InsufficientBalanceWhenSettle(amount, account.balance);
        }

        if (amount > (account.balance - account.pendingRefund)) {
            uint remainingFee = amount - (account.balance - account.pendingRefund);
            if (account.pendingRefund < remainingFee) {
                revert InsufficientBalanceInPendingRefund(remainingFee, account.pendingRefund);
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
        emit BalanceUpdated(requests[0].userAddress, msg.sender, account.balance, account.pendingRefund);
        payable(msg.sender).transfer(amount);
    }

    function verify(Request memory request) external view returns (bool) {
        return request.verify(msg.sender);
    }

    function getAllData() public view returns (Account[] memory accounts, Service[] memory services) {
        accounts = getAllAccounts();
        services = getAllServices();
    }
}
