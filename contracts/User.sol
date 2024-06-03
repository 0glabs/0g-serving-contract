// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

struct User {
    uint256 balance;
    uint256 pendingRefund;
    Refund[] refunds;
}

struct Refund {
    uint256 amount;
    uint256 createdAt;
    bool processed;
}

library UserLibrary {
    using EnumerableSet for EnumerableSet.AddressSet;

    error UserNotexists(address key);
    error InsufficientBalance(address key);
    error RefundInvalid(address key, uint256 index);
    error RefundProcessed(address key, uint256 index);
    error RefundLocked(address key, uint256 index);

    struct UserMap {
        EnumerableSet.AddressSet _keys;
        mapping(address => User) _values;
    }

    function getUser(
        UserMap storage map,
        address key
    ) internal view returns (User storage) {
        return _get(map, key);
    }

    function getAllUsers(
        UserMap storage map
    )
        internal
        view
        returns (address[] memory addresses, uint256[] memory balances)
    {
        uint256 len = _length(map);
        addresses = new address[](len);
        balances = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            (address key, User storage value) = _at(map, i);
            addresses[i] = key;
            balances[i] = value.balance;
        }
    }

    function depositFund(
        UserMap storage map,
        address key,
        uint256 amount
    ) internal returns (uint256) {
        if (!_contains(map, key)) {
            _set(map, key, amount);
            return amount;
        }
        User storage user = _get(map, key);
        user.balance += amount;
        return user.balance;
    }

    function requestRefund(
        UserMap storage map,
        address key,
        uint256 amount
    ) internal returns (uint256) {
        User storage user = _get(map, key);
        if ((user.balance - user.pendingRefund) < amount) {
            revert InsufficientBalance(key);
        }
        user.refunds.push(Refund(amount, block.timestamp, false));
        user.pendingRefund += amount;
        return user.refunds.length - 1;
    }

    function processRefund(
        UserMap storage map,
        address key,
        uint256 index,
        uint256 lockTime
    ) internal returns (uint256, uint256, uint256) {
        User storage user = _get(map, key);
        if (index > user.refunds.length) {
            revert RefundInvalid(key, index);
        }
        Refund storage refund = user.refunds[index];
        if (refund.processed) {
            revert RefundProcessed(key, index);
        }
        if (block.timestamp < refund.createdAt + lockTime) {
            revert RefundLocked(key, index);
        }
        user.balance -= refund.amount;
        user.pendingRefund -= refund.amount;
        refund.processed = true;
        return (refund.amount, user.balance, user.pendingRefund);
    }

    function _at(
        UserMap storage map,
        uint256 index
    ) internal view returns (address, User storage) {
        address key = map._keys.at(index);
        return (key, map._values[key]);
    }

    function _contains(
        UserMap storage map,
        address key
    ) internal view returns (bool) {
        return map._keys.contains(key);
    }

    function _length(UserMap storage map) internal view returns (uint256) {
        return map._keys.length();
    }

    function _get(
        UserMap storage map,
        address key
    ) internal view returns (User storage) {
        User storage value = map._values[key];
        if (!_contains(map, key)) {
            revert UserNotexists(key);
        }
        return value;
    }

    function _set(UserMap storage map, address key, uint256 balance) internal {
        User storage user = map._values[key];
        user.balance = balance;
        map._keys.add(key);
    }
}
