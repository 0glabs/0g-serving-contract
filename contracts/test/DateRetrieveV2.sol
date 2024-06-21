// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "../UserAccount.sol";
import "../Service.sol";
import "../Request.sol";

contract DataRetrieveV2 is OwnableUpgradeable {
    using UserAccountLibrary for UserAccountLibrary.UserAccountMap;
    using ServiceLibrary for ServiceLibrary.ServiceMap;
    using RequestLibrary for Request;

    uint public lockTime;
    UserAccountLibrary.UserAccountMap private userAccountMap;
    ServiceLibrary.ServiceMap private serviceMap;
    mapping(bytes32 => uint) private nonceMap;

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
        uint inputPrice,
        uint outputPrice,
        string url,
        uint updatedAt
    );
    event ServiceRemoved(address indexed service, string indexed name);

    function initialize(uint _locktime) public initializer {
        __Ownable_init(msg.sender);
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
    ) public view returns (uint inputPrice, uint outputPrice, string memory url, uint updatedAt) {
        (inputPrice, outputPrice, url, updatedAt) = serviceMap.getService(provider, name);
    }

    function getAllServices()
        public
        view
        returns (
            address[] memory addresses,
            uint[] memory inputPrices,
            uint[] memory outputPrices,
            string[] memory urls,
            string[] memory names,
            uint[] memory updatedAts
        )
    {
        (addresses, inputPrices, outputPrices, urls, names, updatedAts) = serviceMap.getAllServices();
    }

    function addOrUpdateService(string memory name, uint inputPrice, uint outputPrice, string calldata url) external {
        serviceMap.addOrUpdateService(msg.sender, name, inputPrice, outputPrice, url);
        emit ServiceUpdated(msg.sender, name, inputPrice, outputPrice, url, block.timestamp);
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
        bytes memory previousSignature = hex"0000000000000000000000000000000000000000";
        for (uint i = 0; i < requests.length; i++) {
            Request memory request = requests[i];

            bytes32 key = keccak256(abi.encode(request.userAddress, msg.sender));
            require(request.nonce > nonceMap[key], "Nonce used");
            nonceMap[key] = request.nonce;

            request.previousSignature = previousSignature;
            require(request.verify(msg.sender), "Invalid request");
            previousSignature = request.signature;

            (uint inputPrice, uint outputPrice, , uint updatedAt) = serviceMap.getService(msg.sender, request.name);
            require(updatedAt < request.createdAt, "Service updated");
            amount += request.inputCount * inputPrice;
            amount += request.previousOutputCount * outputPrice;
        }
        UserAccount storage userAccount = userAccountMap.getUserAccount(requests[0].userAddress, msg.sender);

        require(userAccount.balance >= amount, "Insufficient balance");
        userAccount.balance -= amount;
        emit BalanceUpdated(requests[0].userAddress, msg.sender, userAccount.balance);
        payable(msg.sender).transfer(amount);
    }

    function verify(Request memory request) external view returns (bool) {
        return request.verify(msg.sender);
    }

    function retrieveAllData()
        public
        view
        returns (
            address[] memory userAddresses,
            address[] memory userAccountProviderAddresses,
            uint[] memory userAccountBalances,
            address[] memory providerAddresses,
            uint[] memory serviceInputPrices,
            uint[] memory serviceOutputPrices,
            string[] memory serviceUrls,
            string[] memory names,
            uint[] memory serviceUpdatedAts
        )
    {
        (userAddresses, userAccountProviderAddresses, userAccountBalances) = getAllUserAccounts();
        (
            providerAddresses,
            serviceInputPrices,
            serviceOutputPrices,
            serviceUrls,
            names,
            serviceUpdatedAts
        ) = getAllServices();
    }
}
