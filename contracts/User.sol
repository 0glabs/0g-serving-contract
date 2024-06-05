// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

struct User {
    uint balance;
    uint pendingRefund;
    Refund[] refunds;
}

struct Refund {
    uint amount;
    uint createdAt;
    bool processed;
}

library UserLibrary {
    using EnumerableSet for EnumerableSet.AddressSet;

    error UserNotexists(address key);
    error InsufficientBalance(address key);
    error RefundInvalid(address key, uint index);
    error RefundProcessed(address key, uint index);
    error RefundLocked(address key, uint index);

    struct UserMap {
        EnumerableSet.AddressSet _keys;
        mapping(address => User) _values;
    }

    function getUser(UserMap storage map, address key) internal view returns (User storage) {
        return _get(map, key);
    }

    function getAllUsers(
        UserMap storage map
    ) internal view returns (address[] memory addresses, uint[] memory balances) {
        uint len = _length(map);
        addresses = new address[](len);
        balances = new uint[](len);
        for (uint i = 0; i < len; i++) {
            (address key, User storage value) = _at(map, i);
            addresses[i] = key;
            balances[i] = value.balance;
        }
    }

    function depositFund(UserMap storage map, address key, uint amount) internal returns (uint) {
        if (!_contains(map, key)) {
            _set(map, key, amount);
            return amount;
        }
        User storage user = _get(map, key);
        user.balance += amount;
        return user.balance;
    }

    function requestRefund(UserMap storage map, address key, uint amount) internal returns (uint) {
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
        uint index,
        uint lockTime
    ) internal returns (uint, uint, uint) {
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

    function _at(UserMap storage map, uint index) internal view returns (address, User storage) {
        address key = map._keys.at(index);
        return (key, map._values[key]);
    }

    function _contains(UserMap storage map, address key) internal view returns (bool) {
        return map._keys.contains(key);
    }

    function _length(UserMap storage map) internal view returns (uint) {
        return map._keys.length();
    }

    function _get(UserMap storage map, address key) internal view returns (User storage) {
        User storage value = map._values[key];
        if (!_contains(map, key)) {
            revert UserNotexists(key);
        }
        return value;
    }

    function _set(UserMap storage map, address key, uint balance) internal {
        User storage user = map._values[key];
        user.balance = balance;
        map._keys.add(key);
    }
}
