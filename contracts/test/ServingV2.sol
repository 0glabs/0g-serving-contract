// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "../utils/Initializable.sol";
import "../UserAccount.sol";
import "../Service.sol";
import "../Request.sol";

contract ServingV2 is Ownable, Initializable {
    using UserAccountLibrary for UserAccountLibrary.UserAccountMap;
    using ServiceLibrary for ServiceLibrary.ServiceMap;
    using RequestLibrary for Request;

    uint public lockTime;
    UserAccountLibrary.UserAccountMap private userAccountMap;
    ServiceLibrary.ServiceMap private serviceMap;

    event BalanceUpdated(address indexed user, address indexed provider, uint amount);
    event RefundRequested(
        address indexed user,
        address indexed provider,
        uint indexed index,
        uint amount,
        uint timestamp
    );
    event RefundProcessed(address indexed user, address indexed provider, uint indexed index, uint amount);
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

    function initialize(uint _locktime, address owner) public onlyInitializeOnce {
        _transferOwnership(owner);
        lockTime = _locktime;
    }

    function updateLockTime(uint _locktime) public onlyOwner {
        lockTime = _locktime;
    }

    function getUserAccountBalance(address user, address provider) public view returns (uint) {
        return userAccountMap.getUserAccount(user, provider).balance;
    }

    function getAllUserAccounts() public view returns (address[] memory, address[] memory, uint[] memory) {
        return userAccountMap.getAllUserAccounts();
    }

    function depositFund(address provider) external payable {
        uint balance = userAccountMap.depositFund(msg.sender, provider, msg.value);
        emit BalanceUpdated(msg.sender, provider, balance);
    }

    function requestRefund(address provider, uint amount) external {
        uint index = userAccountMap.requestRefund(msg.sender, provider, amount);
        emit RefundRequested(msg.sender, provider, index, amount, block.timestamp);
    }

    function processRefund(address provider, uint index) external {
        (uint amount, uint balance, uint pendingRefund) = userAccountMap.processRefund(
            msg.sender,
            provider,
            index,
            lockTime
        );

        payable(msg.sender).transfer(amount);
        emit RefundProcessed(msg.sender, provider, index, pendingRefund);
        emit BalanceUpdated(msg.sender, provider, balance);
    }

    function getService(
        address provider,
        string memory name
    )
        public
        view
        returns (string memory serviceType, string memory url, uint inputPrice, uint outputPrice, uint updatedAt)
    {
        (serviceType, url, inputPrice, outputPrice, updatedAt) = serviceMap.getService(provider, name);
    }

    function getAllServices()
        public
        view
        returns (
            address[] memory addresses,
            string[] memory names,
            string[] memory serviceTypes,
            string[] memory urls,
            uint[] memory inputPrices,
            uint[] memory outputPrices,
            uint[] memory updatedAts
        )
    {
        (addresses, names, serviceTypes, urls, inputPrices, outputPrices, updatedAts) = serviceMap.getAllServices();
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
        require(requests.length > 0, "Empty request trace");
        uint amount = 0;
        UserAccount storage userAccount = userAccountMap.getUserAccount(requests[0].userAddress, msg.sender);
        for (uint i = 0; i < requests.length; i++) {
            Request memory request = requests[i];

            require(request.nonce > userAccount.nonce, "Nonce used");
            userAccount.nonce = request.nonce;

            require(request.verify(msg.sender), "Invalid request");

            (, , uint inputPrice, uint outputPrice, uint updatedAt) = serviceMap.getService(
                msg.sender,
                request.serviceName
            );
            require(updatedAt < request.createdAt, "Service updated");
            amount += request.inputCount * inputPrice;
            amount += request.previousOutputCount * outputPrice;
        }

        require(userAccount.balance >= amount, "Insufficient balance");
        userAccount.balance -= amount;
        emit BalanceUpdated(requests[0].userAddress, msg.sender, userAccount.balance);
        payable(msg.sender).transfer(amount);
    }

    function verify(Request memory request) external view returns (bool) {
        return request.verify(msg.sender);
    }

    function getAllData()
        public
        view
        returns (
            address[] memory userAddresses,
            address[] memory userAccountProviderAddresses,
            uint[] memory userAccountBalances,
            address[] memory providerAddresses,
            string[] memory names,
            string[] memory serviceTypes,
            string[] memory serviceUrls,
            uint[] memory serviceInputPrices,
            uint[] memory serviceOutputPrices,
            uint[] memory serviceUpdatedAts
        )
    {
        (userAddresses, userAccountProviderAddresses, userAccountBalances) = getAllUserAccounts();
        (
            providerAddresses,
            names,
            serviceTypes,
            serviceUrls,
            serviceInputPrices,
            serviceOutputPrices,
            serviceUpdatedAts
        ) = getAllServices();
    }
}
