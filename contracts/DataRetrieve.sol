// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "./User.sol";
import "./Service.sol";
import "./Request.sol";

contract DataRetrieve is Initializable {
    using UserLibrary for UserLibrary.UserMap;
    using ServiceLibrary for ServiceLibrary.ServiceMap;
    using RequestLibrary for Request;

    UserLibrary.UserMap private userMap;
    ServiceLibrary.ServiceMap private serviceMap;
    mapping(uint256 => bool) usedNonces;
    uint256 public constant LOCK_TIME = 1 days;

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

    function initialize() public initializer {}

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
            .processRefund(msg.sender, index, LOCK_TIME);

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

    // Assume requests in a request trace are made by same user
    function _settleFees(Request[] memory requests) internal {
        require(requests.length > 0, "Empty request trace");
        uint256 amount = 0;
        for (uint i = 0; i < requests.length; i++) {
            Request memory request = requests[i];

            require(!usedNonces[request.nonce], "Nonce used");
            usedNonces[request.nonce] = true;

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
}
