// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "../User.sol";
import "../Service.sol";
import "../Request.sol";

contract DataRetrieveV2 is OwnableUpgradeable {
    using UserLibrary for UserLibrary.UserMap;
    using ServiceLibrary for ServiceLibrary.ServiceMap;
    using RequestLibrary for Request;

    uint256 public lockTime;
    UserLibrary.UserMap private userMap;
    ServiceLibrary.ServiceMap private serviceMap;
    mapping(bytes32 => uint256) private nonceMap;

    event BalanceUpdated(address indexed user, uint256 amount);
    event RefundRequested(
        address indexed user,
        uint256 indexed index,
        uint256 amount,
        uint256 timestamp
    );
    event RefundProcessed(
        address indexed user,
        uint256 indexed index,
        uint256 amount
    );
    event ServiceUpdated(
        address indexed service,
        bytes32 indexed serviceType,
        uint256 price,
        string url,
        uint256 updatedAt
    );
    event ServiceRemoved(address indexed service, bytes32 indexed serviceType);

    function initialize(uint256 _locktime) public initializer {
        __Ownable_init(msg.sender);
        lockTime = _locktime;
    }

    function updateLockTime(uint256 _locktime) public onlyOwner {
        lockTime = _locktime;
    }

    function getUserBalance(address key) public view returns (uint256) {
        return userMap.getUser(key).balance;
    }

    function getAllUsers()
        public
        view
        returns (address[] memory, uint256[] memory)
    {
        return userMap.getAllUsers();
    }

    function depositFund() external payable {
        uint balance = userMap.depositFund(msg.sender, msg.value);
        emit BalanceUpdated(msg.sender, balance);
    }

    function requestRefund(uint256 amount) external {
        uint256 index = userMap.requestRefund(msg.sender, amount);
        emit RefundRequested(msg.sender, index, amount, block.timestamp);
    }

    function processRefund(uint256 index) external {
        (uint256 amount, uint256 balance, uint256 pendingRefund) = userMap
            .processRefund(msg.sender, index, lockTime);

        payable(msg.sender).transfer(amount);
        emit RefundProcessed(msg.sender, index, pendingRefund);
        emit BalanceUpdated(msg.sender, balance);
    }

    function getService(
        address provider,
        bytes32 serviceType
    )
        public
        view
        returns (uint256 price, string memory url, uint256 updatedAt)
    {
        (price, url, updatedAt) = serviceMap.getService(provider, serviceType);
    }

    function getAllServices()
        public
        view
        returns (
            address[] memory addresses,
            uint256[] memory prices,
            string[] memory urls,
            bytes32[] memory serviceTypes,
            uint256[] memory updatedAts
        )
    {
        (addresses, prices, urls, serviceTypes, updatedAts) = serviceMap
            .getAllServices();
    }

    function addOrUpdateService(
        bytes32 serviceType,
        uint256 price,
        string calldata url
    ) external {
        serviceMap.addOrUpdateService(msg.sender, serviceType, price, url);
        emit ServiceUpdated(
            msg.sender,
            serviceType,
            price,
            url,
            block.timestamp
        );
    }

    function removeService(bytes32 serviceType) external {
        serviceMap.removeService(msg.sender, serviceType);
        emit ServiceRemoved(msg.sender, serviceType);
    }

    function settleFees(RequestTrace[] memory traces) external {
        for (uint i = 0; i < traces.length; i++) {
            RequestTrace memory trace = traces[i];
            _settleFees(trace.requests);
        }
    }

    function _settleFees(Request[] memory requests) internal {
        require(requests.length > 0, "Empty request trace");
        uint256 amount = 0;
        for (uint i = 0; i < requests.length; i++) {
            Request memory request = requests[i];

            bytes32 key = keccak256(
                abi.encode(request.userAddress, msg.sender)
            );
            require(request.nonce > nonceMap[key], "Nonce used");
            nonceMap[key] = request.nonce;

            require(request.verify(msg.sender), "Invalid request");

            (uint256 price, , uint256 updatedAt) = serviceMap.getService(
                msg.sender,
                request.serviceType
            );
            require(updatedAt < request.createdAt, "Service updated");
            amount += price;
        }
        User storage user = userMap.getUser(requests[0].userAddress);

        require(user.balance >= amount, "Insufficient balance");
        user.balance -= amount;
        emit BalanceUpdated(requests[0].userAddress, user.balance);
        payable(msg.sender).transfer(amount);
    }

    function retrieveAllData()
        public
        view
        returns (
            address[] memory userAddresses,
            uint256[] memory userBalances,
            address[] memory providerAddresses,
            uint256[] memory servicePrices,
            string[] memory serviceUrls,
            bytes32[] memory serviceTypes,
            uint256[] memory serviceUpdatedAts
        )
    {
        (userAddresses, userBalances) = getAllUsers();
        (
            providerAddresses,
            servicePrices,
            serviceUrls,
            serviceTypes,
            serviceUpdatedAts
        ) = getAllServices();
    }
}
