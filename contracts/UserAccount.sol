// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

struct UserAccount {
    address user;
    address provider;
    uint balance;
    uint pendingRefund;
    Refund[] refunds;
}

struct Refund {
    uint amount;
    uint createdAt;
    bool processed;
}

library UserAccountLibrary {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    error UserAccountNotexists(address user, address provider);
    error InsufficientBalance(address user, address provider);
    error RefundInvalid(address user, address provider, uint index);
    error RefundProcessed(address user, address provider, uint index);
    error RefundLocked(address user, address provider, uint index);

    struct UserAccountMap {
        EnumerableSet.Bytes32Set _keys;
        mapping(bytes32 => UserAccount) _values;
    }

    function getUserAccount(
        UserAccountMap storage map,
        address user,
        address provider
    ) internal view returns (UserAccount storage) {
        return _get(map, user, provider);
    }

    function getAllUserAccounts(
        UserAccountMap storage map
    ) internal view returns (address[] memory users, address[] memory providers, uint[] memory balances) {
        uint len = _length(map);
        users = new address[](len);
        providers = new address[](len);
        balances = new uint[](len);

        for (uint i = 0; i < len; i++) {
            UserAccount storage value = _at(map, i);
            users[i] = value.user;
            providers[i] = value.provider;
            balances[i] = value.balance;
        }
    }

    function depositFund(
        UserAccountMap storage map,
        address user,
        address provider,
        uint amount
    ) internal returns (uint) {
        bytes32 key = _key(user, provider);
        if (!_contains(map, key)) {
            _set(map, key, user, provider, amount);
            return amount;
        }
        UserAccount storage userAccount = _get(map, user, provider);
        userAccount.balance += amount;
        return userAccount.balance;
    }

    function requestRefund(
        UserAccountMap storage map,
        address user,
        address provider,
        uint amount
    ) internal returns (uint) {
        UserAccount storage userAccount = _get(map, user, provider);
        if ((userAccount.balance - userAccount.pendingRefund) < amount) {
            revert InsufficientBalance(user, provider);
        }
        userAccount.refunds.push(Refund(amount, block.timestamp, false));
        userAccount.pendingRefund += amount;
        return userAccount.refunds.length - 1;
    }

    function processRefund(
        UserAccountMap storage map,
        address user,
        address provider,
        uint index,
        uint lockTime
    ) internal returns (uint, uint, uint) {
        UserAccount storage userAccount = _get(map, user, provider);
        if (index > userAccount.refunds.length) {
            revert RefundInvalid(user, provider, index);
        }
        Refund storage refund = userAccount.refunds[index];
        if (refund.processed) {
            revert RefundProcessed(user, provider, index);
        }
        if (block.timestamp < refund.createdAt + lockTime) {
            revert RefundLocked(user, provider, index);
        }
        userAccount.balance -= refund.amount;
        userAccount.pendingRefund -= refund.amount;
        refund.processed = true;
        return (refund.amount, userAccount.balance, userAccount.pendingRefund);
    }

    function _at(UserAccountMap storage map, uint index) internal view returns (UserAccount storage) {
        bytes32 key = map._keys.at(index);
        return map._values[key];
    }

    function _contains(UserAccountMap storage map, bytes32 key) internal view returns (bool) {
        return map._keys.contains(key);
    }

    function _length(UserAccountMap storage map) internal view returns (uint) {
        return map._keys.length();
    }

    function _get(
        UserAccountMap storage map,
        address user,
        address provider
    ) internal view returns (UserAccount storage) {
        bytes32 key = _key(user, provider);
        UserAccount storage value = map._values[key];
        if (!_contains(map, key)) {
            revert UserAccountNotexists(user, provider);
        }
        return value;
    }

    function _set(UserAccountMap storage map, bytes32 key, address user, address provider, uint balance) internal {
        UserAccount storage userAccount = map._values[key];
        userAccount.balance = balance;
        userAccount.user = user;
        userAccount.provider = provider;
        map._keys.add(key);
    }

    function _key(address user, address provider) internal pure returns (bytes32) {
        return keccak256(abi.encode(user, provider));
    }
}
