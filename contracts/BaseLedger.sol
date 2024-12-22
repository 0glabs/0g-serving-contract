// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

struct BaseLedger {
    address customer;
    address provider;
    uint nonce;
    uint balance;
    uint pendingRefund;
    Refund[] refunds;
}

struct Refund {
    uint index;
    uint amount;
    uint createdAt;
    bool processed;
}

struct BaseLedgerMap {
    EnumerableSet.Bytes32Set _keys;
    mapping(bytes32 => BaseLedger) _values;
}

library BaseLedgerLibrary {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    error LedgerNotExists(address customer, address provider);
    error LedgerExists(address customer, address provider);
    error InsufficientBalance(address customer, address provider);
    error RefundInvalid(address customer, address provider, uint index);
    error RefundProcessed(address customer, address provider, uint index);
    error RefundLocked(address customer, address provider, uint index);

    function getLedger(
        BaseLedgerMap storage map,
        address customer,
        address provider,
        string memory serviceType
    ) internal view returns (BaseLedger storage) {
        return _get(map, customer, provider, serviceType);
    }

    function getAllBaseLedgers(BaseLedgerMap storage map) internal view returns (BaseLedger[] memory ledgers) {
        uint len = _length(map);
        ledgers = new BaseLedger[](len);

        for (uint i = 0; i < len; i++) {
            ledgers[i] = at(map, i);
        }
    }

    function addBaseLedger(
        BaseLedgerMap storage map,
        address customer,
        address provider,
        string memory serviceType,
        uint amount
    ) internal returns (uint, uint) {
        bytes32 key = _key(customer, provider, serviceType);
        if (_contains(map, key)) {
            revert LedgerExists(customer, provider);
        }
        _set(map, key, customer, provider, amount);
        return (amount, 0);
    }

    function deleteBaseLedger(
        BaseLedgerMap storage map,
        address customer,
        address provider,
        string memory serviceType
    ) internal {
        bytes32 key = _key(customer, provider, serviceType);
        if (!_contains(map, key)) {
            revert LedgerNotExists(customer, provider);
        }
        map._keys.remove(key);
        delete map._values[key];
    }

    function depositFund(
        BaseLedgerMap storage map,
        address customer,
        address provider,
        string memory serviceType,
        uint amount
    ) internal returns (uint, uint) {
        bytes32 key = _key(customer, provider, serviceType);
        if (!_contains(map, key)) {
            revert LedgerNotExists(customer, provider);
        }
        BaseLedger storage ledger = _get(map, customer, provider, serviceType);
        ledger.balance += amount;
        return (ledger.balance, ledger.pendingRefund);
    }

    function requestRefund(
        BaseLedgerMap storage map,
        address customer,
        address provider,
        string memory serviceType,
        uint amount
    ) internal returns (uint) {
        BaseLedger storage ledger = _get(map, customer, provider, serviceType);
        if ((ledger.balance - ledger.pendingRefund) < amount) {
            revert InsufficientBalance(customer, provider);
        }
        ledger.refunds.push(Refund(ledger.refunds.length, amount, block.timestamp, false));
        ledger.pendingRefund += amount;
        return ledger.refunds.length - 1;
    }

    function processRefund(
        BaseLedgerMap storage map,
        address customer,
        address provider,
        string memory serviceType,
        uint[] memory indices,
        uint lockTime
    ) internal returns (uint totalAmount, uint balance, uint pendingRefund) {
        BaseLedger storage ledger = _get(map, customer, provider, serviceType);
        totalAmount = 0;

        for (uint i = 0; i < indices.length; i++) {
            uint index = indices[i];
            if (index >= ledger.refunds.length) {
                revert RefundInvalid(customer, provider, index);
            }
            Refund storage refund = ledger.refunds[index];
            if (refund.processed) {
                revert RefundProcessed(customer, provider, index);
            }
            if (block.timestamp < refund.createdAt + lockTime) {
                revert RefundLocked(customer, provider, index);
            }
            ledger.balance -= refund.amount;
            ledger.pendingRefund -= refund.amount;
            refund.processed = true;
            totalAmount += refund.amount;
        }

        balance = ledger.balance;
        pendingRefund = ledger.pendingRefund;
    }

    function at(BaseLedgerMap storage map, uint index) internal view returns (BaseLedger storage) {
        bytes32 key = map._keys.at(index);
        return map._values[key];
    }

    function _contains(BaseLedgerMap storage map, bytes32 key) internal view returns (bool) {
        return map._keys.contains(key);
    }

    function _length(BaseLedgerMap storage map) internal view returns (uint) {
        return map._keys.length();
    }

    function _get(
        BaseLedgerMap storage map,
        address customer,
        address provider,
        string memory serviceType
    ) internal view returns (BaseLedger storage) {
        bytes32 key = _key(customer, provider, serviceType);
        BaseLedger storage value = map._values[key];
        if (!_contains(map, key)) {
            revert LedgerNotExists(customer, provider);
        }
        return value;
    }

    function _set(BaseLedgerMap storage map, bytes32 key, address customer, address provider, uint balance) internal {
        BaseLedger storage ledger = map._values[key];
        ledger.balance = balance;
        ledger.customer = customer;
        ledger.provider = provider;
        map._keys.add(key);
    }

    function _key(address customer, address provider, string memory serviceType) internal pure returns (bytes32) {
        return keccak256(abi.encode(customer, provider, serviceType));
    }
}
