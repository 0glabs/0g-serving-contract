// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

struct Account {
    address user;
    address provider;
    uint nonce;
    uint balance;
    uint pendingRefund;
    uint[2] signer;
    Refund[] refunds;
    string additionalInfo;
    uint[2] providerPubKey;
}

struct Refund {
    uint index;
    uint amount;
    uint createdAt;
    bool processed;
}

library AccountLibrary {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    error AccountNotExists(address user, address provider);
    error AccountExists(address user, address provider);
    error InsufficientBalance(address user, address provider);
    error RefundInvalid(address user, address provider, uint index);
    error RefundProcessed(address user, address provider, uint index);
    error RefundLocked(address user, address provider, uint index);

    struct AccountMap {
        EnumerableSet.Bytes32Set _keys;
        mapping(bytes32 => Account) _values;
        mapping(address => EnumerableSet.Bytes32Set) _providerIndex;
        mapping(address => EnumerableSet.Bytes32Set) _userIndex;
    }

    function getAccount(
        AccountMap storage map,
        address user,
        address provider
    ) internal view returns (Account storage) {
        return _get(map, user, provider);
    }

    function getAllAccounts(AccountMap storage map) internal view returns (Account[] memory accounts) {
        uint len = _length(map);
        accounts = new Account[](len);
        
        for (uint i = 0; i < len; i++) {
            accounts[i] = _at(map, i);
        }
    }

    function getAccountsByProvider(
        AccountMap storage map,
        address provider,
        uint offset,
        uint limit
    ) internal view returns (Account[] memory accounts, uint total) {
        EnumerableSet.Bytes32Set storage providerKeys = map._providerIndex[provider];
        total = providerKeys.length();
        
        if (offset >= total) {
            return (new Account[](0), total);
        }
        
        uint end = limit == 0 ? total : offset + limit;
        if (end > total) {
            end = total;
        }
        
        uint resultLen = end - offset;
        accounts = new Account[](resultLen);
        
        for (uint i = 0; i < resultLen; i++) {
            bytes32 key = providerKeys.at(offset + i);
            accounts[i] = map._values[key];
        }
        
        return (accounts, total);
    }

    function getAccountsByUser(
        AccountMap storage map,
        address user,
        uint offset,
        uint limit
    ) internal view returns (Account[] memory accounts, uint total) {
        EnumerableSet.Bytes32Set storage userKeys = map._userIndex[user];
        total = userKeys.length();
        
        if (offset >= total) {
            return (new Account[](0), total);
        }
        
        uint end = limit == 0 ? total : offset + limit;
        if (end > total) {
            end = total;
        }
        
        uint resultLen = end - offset;
        accounts = new Account[](resultLen);
        
        for (uint i = 0; i < resultLen; i++) {
            bytes32 key = userKeys.at(offset + i);
            accounts[i] = map._values[key];
        }
        
        return (accounts, total);
    }

    function getAccountCountByProvider(AccountMap storage map, address provider) internal view returns (uint) {
        return map._providerIndex[provider].length();
    }

    function getAccountCountByUser(AccountMap storage map, address user) internal view returns (uint) {
        return map._userIndex[user].length();
    }

    function getBatchAccountsByUsers(
        AccountMap storage map,
        address[] calldata users,
        address provider
    ) internal view returns (Account[] memory accounts) {
        require(users.length <= 500, "Batch size too large (max 500)");
        accounts = new Account[](users.length);
        
        for (uint i = 0; i < users.length; i++) {
            bytes32 key = _key(users[i], provider);
            if (_contains(map, key)) {
                accounts[i] = map._values[key];
            }
        }
    }

    function accountExists(AccountMap storage map, address user, address provider) internal view returns (bool) {
        return _contains(map, _key(user, provider));
    }

    function getPendingRefund(AccountMap storage map, address user, address provider) internal view returns (uint) {
        Account storage account = _get(map, user, provider);
        return account.pendingRefund;
    }

    function addAccount(
        AccountMap storage map,
        address user,
        address provider,
        uint[2] calldata signer,
        uint amount,
        string memory additionalInfo
    ) internal returns (uint, uint) {
        bytes32 key = _key(user, provider);
        if (_contains(map, key)) {
            revert AccountExists(user, provider);
        }
        
        _set(map, key, user, provider, signer, amount, additionalInfo);
        
        map._providerIndex[provider].add(key);
        map._userIndex[user].add(key);
        
        return (amount, 0);
    }

    function deleteAccount(AccountMap storage map, address user, address provider) internal {
        bytes32 key = _key(user, provider);
        if (!_contains(map, key)) {
            return;
        }
        
        map._providerIndex[provider].remove(key);
        map._userIndex[user].remove(key);
        map._keys.remove(key);
        delete map._values[key];
    }

    function acknowledgeProviderSigner(
        AccountMap storage map,
        address user,
        address provider,
        uint[2] calldata providerPubKey
    ) internal {
        Account storage account = _get(map, user, provider);
        account.providerPubKey = providerPubKey;
    }

    function depositFund(
        AccountMap storage map,
        address user,
        address provider,
        uint cancelRetrievingAmount,
        uint amount
    ) internal returns (uint, uint) {
        Account storage account = _get(map, user, provider);

        if (cancelRetrievingAmount > 0) {
            if (account.refunds.length > 0) {
                Refund[] memory newRefunds = new Refund[](account.refunds.length);
                uint newCount = 0;
                uint remainingCancel = cancelRetrievingAmount;
                uint newPendingRefund = 0;

                for (uint i = 0; i < account.refunds.length; i++) {
                    Refund storage refund = account.refunds[i];
                    
                    if (refund.processed) {
                        continue;
                    }

                    if (remainingCancel >= refund.amount) {
                        remainingCancel -= refund.amount;
                    } else if (remainingCancel > 0) {
                        uint remainingAmount = refund.amount - remainingCancel;
                        newRefunds[newCount] = Refund({
                            index: newCount,
                            amount: remainingAmount,
                            createdAt: refund.createdAt,
                            processed: false
                        });
                        newPendingRefund += remainingAmount;
                        newCount++;
                        remainingCancel = 0;
                    } else {
                        newRefunds[newCount] = Refund({
                            index: newCount,
                            amount: refund.amount,
                            createdAt: refund.createdAt,
                            processed: refund.processed
                        });
                        newPendingRefund += refund.amount;
                        newCount++;
                    }
                }

                account.pendingRefund = newPendingRefund;
                _rebuildRefundArray(account, newRefunds, newCount);
            }
        }

        account.balance += amount;
        return (account.balance, account.pendingRefund);
    }

    function requestRefundAll(AccountMap storage map, address user, address provider) internal {
        Account storage account = _get(map, user, provider);
        uint amount = account.balance - account.pendingRefund;
        if (amount == 0) {
            return;
        }
        account.refunds.push(Refund(account.refunds.length, amount, block.timestamp, false));
        account.pendingRefund += amount;
    }

    function processRefund(
        AccountMap storage map,
        address user,
        address provider,
        uint lockTime
    ) internal returns (uint totalAmount, uint balance, uint pendingRefund) {
        Account storage account = _get(map, user, provider);
        
        if (account.refunds.length == 0) {
            totalAmount = 0;
            pendingRefund = account.pendingRefund;
        } else {
            Refund[] memory newRefunds = new Refund[](account.refunds.length);
            uint newCount = 0;
            totalAmount = 0;
            pendingRefund = 0;

            for (uint i = 0; i < account.refunds.length; i++) {
                Refund storage refund = account.refunds[i];
                
                if (refund.processed) {
                    continue;
                }

                if (block.timestamp >= refund.createdAt + lockTime) {
                    totalAmount += refund.amount;
                } else {
                    newRefunds[newCount] = Refund({
                        index: newCount,
                        amount: refund.amount,
                        createdAt: refund.createdAt,
                        processed: false
                    });
                    pendingRefund += refund.amount;
                    newCount++;
                }
            }

            _rebuildRefundArray(account, newRefunds, newCount);
        }
        
        account.balance -= totalAmount;
        account.pendingRefund = pendingRefund;
        balance = account.balance;
    }



    function _rebuildRefundArray(Account storage account, Refund[] memory newRefunds, uint count) private {
        delete account.refunds;
        
        for (uint i = 0; i < count; i++) {
            account.refunds.push(newRefunds[i]);
        }
    }

    function _at(AccountMap storage map, uint index) internal view returns (Account storage) {
        bytes32 key = map._keys.at(index);
        return map._values[key];
    }

    function _contains(AccountMap storage map, bytes32 key) internal view returns (bool) {
        return map._keys.contains(key);
    }

    function _length(AccountMap storage map) internal view returns (uint) {
        return map._keys.length();
    }

    function _get(AccountMap storage map, address user, address provider) internal view returns (Account storage) {
        bytes32 key = _key(user, provider);
        if (!_contains(map, key)) {
            revert AccountNotExists(user, provider);
        }
        return map._values[key];
    }

    function _set(
        AccountMap storage map,
        bytes32 key,
        address user,
        address provider,
        uint[2] calldata signer,
        uint balance,
        string memory additionalInfo
    ) internal {
        Account storage account = map._values[key];
        account.balance = balance;
        account.user = user;
        account.provider = provider;
        account.signer = signer;
        account.additionalInfo = additionalInfo;
        map._keys.add(key);
    }

    function _key(address user, address provider) internal pure returns (bytes32) {
        return keccak256(abi.encode(user, provider));
    }
}